import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { NodeMsfsProcessRunner } from '../src/msfs/process-runner.js';
import { resolveMsfsCliPath } from '../src/msfs/path.js';
import { aircraftProbeDataSchema } from '../src/msfs/schemas.js';
import { loadMsfsConfig } from '../src/config/schema.js';
import { msfsCliEnvelopeSchema } from '../src/msfs/types.js';

const projectRoot = resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // The caller may provide MSFS_* values through the process environment.
}

type CliOptions = {
  batchSize: number;
  timeoutMs: number;
};

type ProbeData = ReturnType<typeof aircraftProbeDataSchema.parse>;

function usage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:probe:batch -- [--batch-size <count>] [--timeout-minutes <count>]\n\n` +
      `说明：\n` +
      `  分批探测全部非 PassiveAircraft 标题，并在最后合并逐机模式读回结果。\n` +
      `  每批只创建临时 AI；不会切换用户飞机。默认每批 12 架，单批超时默认为 10 分钟。\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} 必须是正整数。`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let batchSize = 12;
  let timeoutMs = 10 * 60 * 1_000;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--batch-size') {
      batchSize = parsePositiveInteger(takeValue(argv, index, '--batch-size'), '--batch-size');
      index += 1;
      continue;
    }
    if (argument === '--timeout-minutes') {
      const minutes = parsePositiveInteger(
        takeValue(argv, index, '--timeout-minutes'),
        '--timeout-minutes',
      );
      timeoutMs = minutes * 60 * 1_000;
      index += 1;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }
  return { batchSize, timeoutMs };
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:.]/gu, '');
}

function countStatuses(results: ProbeData['results']): {
  supported: number;
  unsupported: number;
  unknown: number;
} {
  return {
    supported: results.filter((result) => result.status === 'supported').length,
    unsupported: results.filter((result) => result.status === 'unsupported').length,
    unknown: results.filter((result) => result.status === 'unknown').length,
  };
}

async function main(options: CliOptions): Promise<void> {
  const config = loadMsfsConfig();
  const executablePath = resolveMsfsCliPath({
    ...(config.cliPath ? { configuredPath: config.cliPath } : {}),
    developmentPath: resolve(projectRoot, 'dev-runtime', 'msfs-cli', 'msfs.exe'),
    resourcesPath: resolve(projectRoot, 'resources'),
    cwd: projectRoot,
  });
  const runner = new NodeMsfsProcessRunner();
  const runtimeProbeDirectory = join(projectRoot, 'docs', 'msfs', 'autopilot', 'runtime-probes');
  const chunkPaths: string[] = [];
  const results: ProbeData['results'] = [];
  const seenTitles = new Set<string>();
  let expectedTotal: number | undefined;
  let expectedOffset = 0;
  let cleanup = {
    objects_created: 0,
    objects_removed: 0,
    unresolved_objects: 0,
  };
  let modeCounts = {
    tested: 0,
    supported: 0,
    unsupported: 0,
    unknown: 0,
  };

  const stopDaemon = async (): Promise<void> => {
    const stopped = await runner.run(executablePath, ['daemon', 'stop', '--role', 'ai', '--json'], {
      timeoutMs: 15_000,
      maxOutputBytes: 100_000,
    });
    if (stopped.timedOut || stopped.exitCode !== 0) {
      process.stderr.write('警告：AI daemon 未能在 15 秒内确认停止。\n');
    }
  };

  try {
    for (let batchIndex = 0; ; batchIndex += 1) {
      const batchNumber = batchIndex + 1;
      const skip = expectedOffset;
      process.stderr.write(
        `开始模式测试批次 ${batchNumber}：跳过 ${skip}，最多 ${options.batchSize} 个标题。\n`,
      );
      const run = await runner.run(
        executablePath,
        [
          'aircraft',
          'probe',
          '--skip',
          String(skip),
          '--limit',
          String(options.batchSize),
          '--modes',
          '--unsafe',
          '--role',
          'ai',
          '--json',
        ],
        { timeoutMs: options.timeoutMs, maxOutputBytes: 8_000_000 },
      );
      if (run.timedOut)
        throw new Error(`模式测试批次 ${batchNumber} 超过 ${options.timeoutMs}ms。`);
      if (run.exitCode !== 0) {
        throw new Error(
          `模式测试批次 ${batchNumber} 失败（exit code ${run.exitCode ?? 'unknown'}）：${run.stdout || run.stderr}`,
        );
      }
      let envelope: unknown;
      try {
        envelope = JSON.parse(run.stdout.trim()) as unknown;
      } catch {
        throw new Error(`模式测试批次 ${batchNumber} 返回了无效 JSON：${run.stdout.slice(0, 500)}`);
      }
      const parsedEnvelope = msfsCliEnvelopeSchema.safeParse(envelope);
      if (!parsedEnvelope.success) {
        throw new Error(`模式测试批次 ${batchNumber} 返回的 CLI envelope 不符合协议。`);
      }
      if (!parsedEnvelope.data.ok) {
        throw new Error(`${parsedEnvelope.data.error.code}: ${parsedEnvelope.data.error.message}`);
      }
      const data = aircraftProbeDataSchema.parse(parsedEnvelope.data.data);
      if (data.status !== 'complete' || data.cleanup.status !== 'complete') {
        throw new Error(`模式测试批次 ${batchNumber} 未完整清理临时对象。`);
      }
      if (data.mode_probe_requested !== true) {
        throw new Error(`模式测试批次 ${batchNumber} 没有返回 mode_probe_requested=true。`);
      }
      if (data.candidate_title_offset !== undefined && data.candidate_title_offset !== skip) {
        throw new Error(`模式测试批次 ${batchNumber} 的标题偏移与请求不一致。`);
      }
      if (data.candidate_title_total_count === undefined) {
        throw new Error(`模式测试批次 ${batchNumber} 没有返回 candidate_title_total_count。`);
      }
      if (expectedTotal === undefined) expectedTotal = data.candidate_title_total_count;
      if (expectedTotal !== data.candidate_title_total_count) {
        throw new Error('批次之间的候选标题总数发生变化，已停止合并以避免漏机或重复。');
      }
      for (const result of data.results) {
        if (seenTitles.has(result.aircraft_title)) {
          throw new Error(`批次之间出现重复飞机标题：${result.aircraft_title}`);
        }
        seenTitles.add(result.aircraft_title);
        results.push(result);
      }
      cleanup = {
        objects_created: cleanup.objects_created + data.cleanup.objects_created,
        objects_removed: cleanup.objects_removed + data.cleanup.objects_removed,
        unresolved_objects: cleanup.unresolved_objects + data.cleanup.unresolved_objects,
      };
      modeCounts = {
        tested: modeCounts.tested + (data.mode_tested_aircraft_count ?? 0),
        supported: modeCounts.supported + (data.mode_supported_count ?? 0),
        unsupported: modeCounts.unsupported + (data.mode_unsupported_count ?? 0),
        unknown: modeCounts.unknown + (data.mode_unknown_count ?? 0),
      };

      const chunkPath = join(
        runtimeProbeDirectory,
        `${timestamp()}-aircraft-autopilot-modes-batch-${String(batchNumber).padStart(3, '0')}.json`,
      );
      await mkdir(dirname(chunkPath), { recursive: true });
      await writeFile(
        chunkPath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            collectedAt: new Date().toISOString(),
            source: 'native_simconnect_temporary_ai_batched',
            temporaryAi: true,
            userAircraftSwitched: false,
            autopilotWriteAttempted: false,
            executablePath,
            batch: {
              number: batchNumber,
              skip,
              limit: options.batchSize,
            },
            data,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      chunkPaths.push(chunkPath);
      process.stderr.write(
        `批次 ${batchNumber} 完成：${data.probed_title_count} 架，清理 ${data.cleanup.objects_removed}/${data.cleanup.objects_created}。\n`,
      );

      expectedOffset += data.candidate_title_count;
      if (expectedTotal === 0 || expectedOffset >= expectedTotal) break;
      if (data.candidate_title_count === 0) {
        throw new Error('候选标题偏移未能推进，已停止以避免重复批次。');
      }
    }
    if (expectedTotal === undefined || results.length !== expectedTotal) {
      throw new Error(
        `批次合并数量不完整：期望 ${expectedTotal ?? 'unknown'}，实际 ${results.length}。`,
      );
    }
    await stopDaemon();

    const collectedAt = new Date().toISOString();
    const statuses = countStatuses(results);
    const passiveAircraftPattern = /^(?:Asobo|Microsoft) PassiveAircraft\b/iu;
    const activeResults = results.filter(
      (result) => !passiveAircraftPattern.test(result.aircraft_title),
    );
    const supportedAircraft = activeResults.filter((result) => result.status === 'supported');
    const excludedAircraft = activeResults
      .filter((result) => result.status !== 'supported')
      .map((result) => ({
        aircraft_title: result.aircraft_title,
        status: result.status,
        reason: result.status === 'unsupported' ? 'autopilot_unsupported' : 'autopilot_unknown',
      }));
    const outputPath = join(
      runtimeProbeDirectory,
      `${timestamp()}-aircraft-autopilot-modes-batched.json`,
    );
    const allowlistPath = join(
      projectRoot,
      'docs',
      'msfs',
      'autopilot',
      'autopilot-supported-aircraft.json',
    );
    const modeMatrixPath = join(
      projectRoot,
      'docs',
      'msfs',
      'autopilot',
      'autopilot-mode-support-matrix.json',
    );
    const modeIds = [
      ...new Set(
        supportedAircraft.flatMap((result) => (result.mode_tests ?? []).map((mode) => mode.id)),
      ),
    ];
    const modeSummary = modeIds.map((id) => {
      const tests = supportedAircraft.flatMap((result) =>
        (result.mode_tests ?? []).filter((mode) => mode.id === id),
      );
      return {
        id,
        supportedCount: tests.filter((mode) => mode.status === 'supported').length,
        unsupportedCount: tests.filter((mode) => mode.status === 'unsupported').length,
        unknownCount: tests.filter((mode) => mode.status === 'unknown').length,
        totalCount: tests.length,
      };
    });
    const data: ProbeData = {
      schema_version: 1,
      type: 'aircraft',
      status: 'complete',
      temporary_ai: true,
      user_aircraft_switched: false,
      autopilot_write_attempted: false,
      candidate_title_count: expectedTotal,
      candidate_title_offset: 0,
      candidate_title_total_count: expectedTotal,
      probed_title_count: results.length,
      supported_count: statuses.supported,
      unsupported_count: statuses.unsupported,
      unknown_count: statuses.unknown,
      mode_probe_requested: true,
      mode_tested_aircraft_count: modeCounts.tested,
      mode_supported_count: modeCounts.supported,
      mode_unsupported_count: modeCounts.unsupported,
      mode_unknown_count: modeCounts.unknown,
      cleanup: {
        status: 'complete',
        objects_created: cleanup.objects_created,
        objects_removed: cleanup.objects_removed,
        unresolved_objects: cleanup.unresolved_objects,
      },
      error: null,
      results,
    };
    const artifact = {
      schemaVersion: 1,
      collectedAt,
      source: 'native_simconnect_temporary_ai_batched',
      temporaryAi: true,
      userAircraftSwitched: false,
      autopilotWriteAttempted: false,
      executablePath,
      batchSize: options.batchSize,
      chunkArtifacts: chunkPaths,
      data,
      filter: {
        rule: 'status=supported and title is not a PassiveAircraft SimObject',
        activeTitleCount: activeResults.length,
        supportedActiveTitleCount: supportedAircraft.length,
        excludedTitleCount: excludedAircraft.length,
        supportedAircraft,
        excludedAircraft,
      },
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await writeFile(
      allowlistPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: collectedAt,
          sourceProbeArtifact: outputPath,
          rule: 'status=supported and title is not a PassiveAircraft SimObject',
          count: supportedAircraft.length,
          aircraft: supportedAircraft,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await writeFile(
      modeMatrixPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: collectedAt,
          sourceProbeArtifact: outputPath,
          rule: 'AUTOPILOT AVAILABLE=1 plus successful SimConnect event/readback on temporary AI',
          aircraftCount: supportedAircraft.length,
          capabilityCount: modeSummary.length,
          summary: modeSummary,
          aircraft: supportedAircraft.map((result) => ({
            aircraft_title: result.aircraft_title,
            autopilot_available: result.autopilot_available,
            mode_tests: result.mode_tests,
          })),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          outputPath,
          modeMatrixPath,
          allowlistPath,
          chunkCount: chunkPaths.length,
          status: data.status,
          candidateTitleCount: data.candidate_title_count,
          probedTitleCount: data.probed_title_count,
          supportedCount: data.supported_count,
          unsupportedCount: data.unsupported_count,
          unknownCount: data.unknown_count,
          activeTitleCount: activeResults.length,
          supportedActiveTitleCount: supportedAircraft.length,
          excludedTitleCount: excludedAircraft.length,
          modeTestedAircraftCount: data.mode_tested_aircraft_count,
          modeSupportedCount: data.mode_supported_count,
          modeUnsupportedCount: data.mode_unsupported_count,
          modeUnknownCount: data.mode_unknown_count,
          cleanup: data.cleanup,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    // A completed run has already stopped the daemon. This second attempt is idempotent.
    try {
      await stopDaemon();
    } catch {
      process.stderr.write('警告：无法确认 AI daemon 已停止。\n');
    }
  }
}

const rawArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const parsed = parseArgs(rawArgs);
if ('help' in parsed) {
  usage();
} else {
  await main(parsed);
}
