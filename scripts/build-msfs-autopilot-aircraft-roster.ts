import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { aircraftProbeDataSchema } from '../src/msfs/schemas.js';

const projectRoot = resolve(import.meta.dirname, '..');

type CliOptions = {
  probePath: string;
  partnerPath: string;
  outputPath: string;
};

const partnerAircraftSchema = z.object({
  packageName: z.string().min(1),
  packageVersion: z.string().min(1).optional(),
  creator: z.string().min(1).optional(),
  title: z.string().min(1),
  manufacturer: z.string().min(1).optional(),
});

const partnerFileSchema = z.object({
  schemaVersion: z.literal(1),
  sourceCatalog: z.string().min(1),
  selection: z.object({
    boundaryStatus: z.literal('official_partner_candidate'),
    count: z.number().int().nonnegative(),
    autopilotStatus: z.literal('unknown'),
  }),
  aircraft: z.array(partnerAircraftSchema),
});

function usage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:roster -- --probe <batched-probe-artifact>\n\n选项：\n  --probe <path>    完整批量探测 artifact\n  --partner <path>  官方合作方候选清单，默认读取项目内文件\n  --output <path>   合并名册输出路径\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let probePath: string | undefined;
  let partnerPath = join(
    projectRoot,
    'docs',
    'msfs',
    'autopilot',
    'official-partner-aircraft-candidates.json',
  );
  let outputPath = join(projectRoot, 'docs', 'msfs', 'autopilot', 'autopilot-aircraft-roster.json');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--probe') {
      probePath = resolve(projectRoot, takeValue(argv, index, '--probe'));
      index += 1;
      continue;
    }
    if (argument === '--partner') {
      partnerPath = resolve(projectRoot, takeValue(argv, index, '--partner'));
      index += 1;
      continue;
    }
    if (argument === '--output') {
      outputPath = resolve(projectRoot, takeValue(argv, index, '--output'));
      index += 1;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }

  if (!probePath) throw new Error('--probe 必须指定一次完整批量探测 artifact。');
  return { probePath, partnerPath, outputPath };
}

const rawArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const parsed = parseArgs(rawArgs);
if ('help' in parsed) {
  usage();
} else {
  const source = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(parsed.probePath, 'utf8')) as unknown);
  const data = aircraftProbeDataSchema.parse(source.data);
  const partnerFile = partnerFileSchema.parse(
    JSON.parse(await readFile(parsed.partnerPath, 'utf8')) as unknown,
  );
  const passiveAircraftPattern = /^(?:Asobo|Microsoft) PassiveAircraft\b/iu;
  const activeResults = data.results.filter(
    (result) => !passiveAircraftPattern.test(result.aircraft_title),
  );
  const supportedResults = activeResults.filter((result) => result.status === 'supported');
  const excludedResults = activeResults.filter((result) => result.status !== 'supported');

  if (data.status !== 'complete')
    throw new Error('探测 artifact 不是 complete，拒绝更新正式名册。');
  if (data.user_aircraft_switched || data.autopilot_write_attempted) {
    throw new Error('探测 artifact 包含用户飞机切换或自动驾驶写入，拒绝更新正式名册。');
  }
  if (data.cleanup.status !== 'complete' || data.cleanup.unresolved_objects !== 0) {
    throw new Error('探测 artifact 清理不完整，拒绝更新正式名册。');
  }
  if (partnerFile.selection.count !== partnerFile.aircraft.length) {
    throw new Error('合作方候选清单的 count 与 aircraft 数量不一致。');
  }

  const collectedAt =
    typeof source.collectedAt === 'string' ? source.collectedAt : new Date().toISOString();
  const output = {
    schemaVersion: 1,
    generatedAt: collectedAt,
    identityLevels: {
      runtime: 'SimConnect 可生成的飞机标题（含变体）',
      officialPartner: '官方安装包级候选，不与 runtime 标题强行合并',
    },
    sources: {
      runtimeProbeArtifact: parsed.probePath,
      officialAircraftCatalog: join(
        projectRoot,
        'docs',
        'msfs',
        'autopilot',
        'official-aircraft-catalog.json',
      ),
      officialPartnerCandidates: parsed.partnerPath,
      officialSdkDocuments: [
        'https://docs.flightsimulator.com/msfs2024/flighting/content-configuration/cfg-files/systems.cfg/',
        'https://docs.flightsimulator.com/msfs2024/html/6_Programming_APIs/Key_Events/Aircraft_Autopilot_Flight_Assist_Events.htm',
        'https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/events-and-data/simconnect_transmitclientevent/',
      ],
    },
    determination: {
      officialConfiguration: {
        file: 'systems.cfg',
        section: '[AUTOPILOT]',
        autopilotAvailable:
          'autopilot_available=1 means available; 0 disables the autopilot system',
        flightDirectorAvailable:
          'flight_director_available is an independent flight-director configuration field',
        caveat: 'Configuration availability does not prove every mode or control path.',
      },
      runtimeGate: 'AUTOPILOT AVAILABLE=1 on a temporary AI object',
      runtimeModeProof:
        'A standard event changes the corresponding SimVar to the requested state and the OFF operation reads back clear.',
      statusPolicy: {
        supported: 'Included in the execution allowlist only when the AP gate is available.',
        unsupported: 'Excluded when the AP gate is explicitly unavailable at runtime.',
        unknown:
          'Retained for audit but never executable when the official data or readback is inconclusive.',
      },
    },
    summary: {
      runtimeEnumeratedTitleCount: data.candidate_title_total_count ?? data.candidate_title_count,
      runtimeActiveTitleCount: activeResults.length,
      runtimeSupportedTitleCount: supportedResults.length,
      runtimeUnsupportedTitleCount: excludedResults.filter(
        (result) => result.status === 'unsupported',
      ).length,
      runtimeUnknownTitleCount: excludedResults.filter((result) => result.status === 'unknown')
        .length,
      officialPartnerCandidatePackageCount: partnerFile.aircraft.length,
      executionAllowlistPath: join(
        projectRoot,
        'docs',
        'msfs',
        'autopilot',
        'autopilot-supported-aircraft.json',
      ),
    },
    executionAllowlist: supportedResults.map((result) => ({
      aircraft_title: result.aircraft_title,
      status: 'supported' as const,
      autopilot_available: result.autopilot_available,
    })),
    runtimeExcluded: excludedResults.map((result) => ({
      aircraft_title: result.aircraft_title,
      status: result.status,
      reason:
        result.status === 'unsupported' ? 'autopilot_gate_unavailable' : 'autopilot_gate_unknown',
    })),
    officialPartnerCandidates: partnerFile.aircraft.map((aircraft) => ({
      ...aircraft,
      status: 'unknown' as const,
      executable: false,
      reason:
        'Official partner candidate; package metadata alone does not prove autopilot capability.',
    })),
  };

  await mkdir(dirname(parsed.outputPath), { recursive: true });
  await writeFile(parsed.outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath: parsed.outputPath,
        runtimeActiveTitleCount: activeResults.length,
        runtimeSupportedTitleCount: supportedResults.length,
        runtimeExcludedTitleCount: excludedResults.length,
        officialPartnerCandidatePackageCount: partnerFile.aircraft.length,
      },
      null,
      2,
    )}\n`,
  );
}
