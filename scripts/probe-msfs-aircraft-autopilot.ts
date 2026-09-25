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
  outputPath?: string;
  limit: number;
  skip: number;
  timeoutMs: number;
  modes: boolean;
  writeAllowlist: boolean;
};

function usage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:probe -- [--modes] [--output <path>] [--skip <count>] [--limit <count>] [--timeout-minutes <count>] [--no-allowlist]\n\n` +
      `说明：\n` +
      `  临时创建非 ATC AI 飞机，读取官方自动驾驶 SimVar，然后立即删除对象。\n` +
      `  不切换用户飞机；--modes 会向临时 AI 发送 AP/FD/HDG/NAV/ALT/VS/FLC 事件并读取回执。\n` +
      `  --skip/--limit 用于分批选择去重标题；--limit 0 表示从 skip 开始到末尾。\n` +
      `  --modes 自动排除 PassiveAircraft；--no-allowlist 不改写正式白名单。\n` +
      `  默认结果写入 docs/msfs/autopilot/runtime-probes/<timestamp>-aircraft-autopilot[(-modes)].json。\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parseNonNegativeInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${option} 必须是非负整数。`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let outputPath: string | undefined;
  let limit = 0;
  let skip = 0;
  let timeoutMs = 30 * 60 * 1_000;
  let modes = false;
  let writeAllowlist = true;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--modes') {
      modes = true;
      continue;
    }
    if (argument === '--no-allowlist') {
      writeAllowlist = false;
      continue;
    }
    if (argument === '--output') {
      outputPath = resolve(projectRoot, takeValue(argv, index, '--output'));
      index += 1;
      continue;
    }
    if (argument === '--limit') {
      limit = parseNonNegativeInteger(takeValue(argv, index, '--limit'), '--limit');
      index += 1;
      continue;
    }
    if (argument === '--skip') {
      skip = parseNonNegativeInteger(takeValue(argv, index, '--skip'), '--skip');
      index += 1;
      continue;
    }
    if (argument === '--timeout-minutes') {
      const minutes = parseNonNegativeInteger(
        takeValue(argv, index, '--timeout-minutes'),
        '--timeout-minutes',
      );
      if (minutes < 1) throw new Error('--timeout-minutes 必须至少为 1。');
      timeoutMs = minutes * 60 * 1_000;
      index += 1;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }
  return { ...(outputPath ? { outputPath } : {}), limit, skip, timeoutMs, modes, writeAllowlist };
}

const rawArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const parsed = parseArgs(rawArgs);
if ('help' in parsed) {
  usage();
} else {
  const config = loadMsfsConfig();
  const executablePath = resolveMsfsCliPath({
    ...(config.cliPath ? { configuredPath: config.cliPath } : {}),
    developmentPath: resolve(projectRoot, 'dev-runtime', 'msfs-cli', 'msfs.exe'),
    resourcesPath: resolve(projectRoot, 'resources'),
    cwd: projectRoot,
  });
  const args = [
    'aircraft',
    'probe',
    ...(parsed.limit > 0 ? ['--limit', String(parsed.limit)] : []),
    ...(parsed.skip > 0 ? ['--skip', String(parsed.skip)] : []),
    ...(parsed.modes ? ['--modes'] : []),
    '--unsafe',
    '--role',
    'ai',
    '--json',
  ];
  const runner = new NodeMsfsProcessRunner();
  process.stderr.write(
    `开始临时 AI 飞机批量探测：跳过 ${parsed.skip} 个标题，${parsed.limit > 0 ? `最多 ${parsed.limit} 个标题` : '直到末尾'}。\n`,
  );
  const result = await runner.run(executablePath, args, {
    timeoutMs: parsed.timeoutMs,
    maxOutputBytes: 8_000_000,
  });
  if (result.timedOut) throw new Error(`批量探测超过 ${parsed.timeoutMs}ms，CLI 已被终止。`);
  if (result.exitCode !== 0) {
    throw new Error(
      `批量探测失败（exit code ${result.exitCode ?? 'unknown'}）：${result.stdout || result.stderr}`,
    );
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(result.stdout.trim()) as unknown;
  } catch {
    throw new Error(`批量探测返回了无效 JSON：${result.stdout.slice(0, 500)}`);
  }
  const parsedEnvelope = msfsCliEnvelopeSchema.safeParse(envelope);
  if (!parsedEnvelope.success) throw new Error('批量探测返回的 CLI 协议不符合标准 envelope。');
  if (!parsedEnvelope.data.ok) {
    throw new Error(`${parsedEnvelope.data.error.code}: ${parsedEnvelope.data.error.message}`);
  }
  const data = aircraftProbeDataSchema.parse(parsedEnvelope.data.data);
  const collectedAt = new Date().toISOString();
  const passiveAircraftPattern = /^(?:Asobo|Microsoft) PassiveAircraft\b/iu;
  const activeResults = data.results.filter(
    (result) => !passiveAircraftPattern.test(result.aircraft_title),
  );
  const supportedAircraft = activeResults.filter((result) => result.status === 'supported');
  const excludedAircraft = data.results
    .filter(
      (result) =>
        result.status !== 'supported' || passiveAircraftPattern.test(result.aircraft_title),
    )
    .map((result) => ({
      aircraft_title: result.aircraft_title,
      status: result.status,
      reason: passiveAircraftPattern.test(result.aircraft_title)
        ? 'passive_simobject'
        : result.status === 'unsupported'
          ? 'autopilot_unsupported'
          : 'autopilot_unknown',
    }));
  const outputPath =
    parsed.outputPath ??
    join(
      projectRoot,
      'docs',
      'msfs',
      'autopilot',
      'runtime-probes',
      `${collectedAt.replaceAll(/[-:.]/gu, '')}-aircraft-autopilot${parsed.modes ? '-modes' : ''}${parsed.skip > 0 ? `-skip-${parsed.skip}` : ''}.json`,
    );
  const allowlistPath = join(
    projectRoot,
    'docs',
    'msfs',
    'autopilot',
    'autopilot-supported-aircraft.json',
  );
  const artifact = {
    schemaVersion: 1,
    collectedAt,
    source: 'native_simconnect_temporary_ai',
    temporaryAi: true,
    userAircraftSwitched: false,
    autopilotWriteAttempted: false,
    executablePath,
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
  const modeMatrixPath = join(
    projectRoot,
    'docs',
    'msfs',
    'autopilot',
    'autopilot-mode-support-matrix.json',
  );
  const modeRows = supportedAircraft.filter((result) => (result.mode_tests ?? []).length > 0);
  const modeIds = [
    ...new Set(modeRows.flatMap((result) => (result.mode_tests ?? []).map((mode) => mode.id))),
  ];
  const modeSummary = modeIds.map((id) => {
    const tests = modeRows.flatMap((result) =>
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
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  if (parsed.writeAllowlist) {
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
  }
  if (parsed.modes) {
    await writeFile(
      modeMatrixPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: collectedAt,
          sourceProbeArtifact: outputPath,
          rule: 'AUTOPILOT AVAILABLE=1 plus successful SimConnect event/readback on temporary AI',
          aircraftCount: modeRows.length,
          capabilityCount: modeSummary.length,
          summary: modeSummary,
          aircraft: modeRows.map((result) => ({
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
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath,
        ...(parsed.writeAllowlist ? { allowlistPath } : {}),
        status: data.status,
        candidateTitleCount: data.candidate_title_count,
        probedTitleCount: data.probed_title_count,
        supportedCount: data.supported_count,
        unsupportedCount: data.unsupported_count,
        unknownCount: data.unknown_count,
        activeTitleCount: activeResults.length,
        supportedActiveTitleCount: supportedAircraft.length,
        excludedTitleCount: excludedAircraft.length,
        cleanup: data.cleanup,
        ...(parsed.modes
          ? {
              modeMatrixPath,
              modeProbeRequested: data.mode_probe_requested ?? false,
              modeTestedAircraftCount: data.mode_tested_aircraft_count ?? 0,
              modeSupportedCount: data.mode_supported_count ?? 0,
              modeUnsupportedCount: data.mode_unsupported_count ?? 0,
              modeUnknownCount: data.mode_unknown_count ?? 0,
            }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  if (data.status !== 'complete' || data.cleanup.status !== 'complete') process.exitCode = 1;
}
