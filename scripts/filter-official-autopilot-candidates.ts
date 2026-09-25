import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { aircraftProbeDataSchema } from '../src/msfs/schemas.js';

const projectRoot = resolve(import.meta.dirname, '..');
const catalogPath = join(projectRoot, 'docs', 'msfs', 'autopilot', 'official-aircraft-catalog.json');
const partnerCandidatesPath = join(
  projectRoot,
  'docs',
  'msfs',
  'autopilot',
  'official-partner-aircraft-candidates.json',
);
const inventoryPath = join(
  projectRoot,
  'docs',
  'msfs',
  'autopilot',
  'aircraft-inventory-20260907.json',
);
const defaultOutputPath = join(
  projectRoot,
  'docs',
  'msfs',
  'autopilot',
  'official-autopilot-candidate-filter.json',
);

const catalogPackageSchema = z.object({
  packageName: z.string().min(1),
  title: z.string().min(1),
  creator: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  packageRole: z.string().min(1),
  boundary: z.object({ status: z.string().min(1) }),
});

const catalogSchema = z.object({
  packages: z.array(catalogPackageSchema),
});

const partnerCandidatesSchema = z.object({
  selection: z.object({
    boundaryStatus: z.literal('official_partner_candidate'),
    count: z.number().int().nonnegative(),
  }),
  aircraft: z.array(z.object({ packageName: z.string().min(1) })),
});

const inventoryTitleSchema = z
  .object({
    title: z.string().min(1),
    relation: z.string().optional(),
    presetIdentityStatus: z.string().optional(),
  })
  .passthrough();

const inventoryModelSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  localPackageEvidence: z.array(z.object({ packageName: z.string().min(1) })).default([]),
  runtimeTitleGrouping: z
    .object({
      method: z.string().optional(),
      pattern: z.string().nullable().optional(),
    })
    .passthrough()
    .optional(),
  observedRuntimeTitles: z.array(inventoryTitleSchema).default([]),
});

const inventorySchema = z.object({
  models: z.array(inventoryModelSchema),
});

type ProbeResult = z.infer<typeof aircraftProbeDataSchema>['results'][number];
type InventoryModel = z.infer<typeof inventoryModelSchema>;

type CliOptions = {
  probePath: string;
  outputPath: string;
};

function usage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:filter:official -- --probe <batched-probe-artifact>\n\n选项：\n  --probe <path>   完整批量探测 artifact\n  --output <path>  筛选结果输出路径\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let probePath: string | undefined;
  let outputPath = defaultOutputPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--probe') {
      probePath = resolve(projectRoot, takeValue(argv, index, '--probe'));
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
  return { probePath, outputPath };
}

function pathLabel(path: string): string {
  return relative(projectRoot, path).replaceAll('\\', '/');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function modeResults(result: ProbeResult) {
  return (result.mode_tests ?? []).map((mode) => ({
    id: mode.id,
    readback: mode.readback,
    onEvent: mode.on_event,
    offEvent: mode.off_event,
    status: mode.status,
  }));
}

function resultRecord(result: ProbeResult, inventoryTitle: z.infer<typeof inventoryTitleSchema>) {
  return {
    aircraftTitle: result.aircraft_title,
    runtimeStatus: result.status,
    autopilotAvailable: result.autopilot_available,
    runtimeModeResults: modeResults(result),
    inventoryRelation: inventoryTitle.relation ?? null,
    presetIdentityStatus: inventoryTitle.presetIdentityStatus ?? null,
  };
}

const rawArgs = process.argv.slice(2).filter((argument) => argument !== '--');
const parsed = parseArgs(rawArgs);

if ('help' in parsed) {
  usage();
} else {
  const probeSource = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(parsed.probePath, 'utf8')) as unknown);
  const probeData = aircraftProbeDataSchema.parse(probeSource.data);
  const catalog = catalogSchema.parse(
    JSON.parse(await readFile(catalogPath, 'utf8')) as unknown,
  );
  const partnerCandidates = partnerCandidatesSchema.parse(
    JSON.parse(await readFile(partnerCandidatesPath, 'utf8')) as unknown,
  );
  const inventory = inventorySchema.parse(
    JSON.parse(await readFile(inventoryPath, 'utf8')) as unknown,
  );

  if (probeData.status !== 'complete') {
    throw new Error('探测 artifact 不是 complete，拒绝生成官方及合作方候选清单。');
  }
  if (probeData.user_aircraft_switched || probeData.autopilot_write_attempted) {
    throw new Error('探测 artifact 包含用户飞机切换或自动驾驶写入，拒绝生成候选清单。');
  }
  if (probeData.cleanup.status !== 'complete' || probeData.cleanup.unresolved_objects !== 0) {
    throw new Error('探测 artifact 清理不完整，拒绝生成候选清单。');
  }

  const officialPackages = catalog.packages.filter(
    (aircraft) => aircraft.boundary.status === 'official' && aircraft.packageRole === 'flyable',
  );
  if (officialPackages.length !== 39) {
    throw new Error(`官方可驾驶飞机包数量应为 39，实际为 ${officialPackages.length}。`);
  }
  if (partnerCandidates.selection.count !== partnerCandidates.aircraft.length) {
    throw new Error('官方合作方候选清单的 count 与 aircraft 数量不一致。');
  }

  const partnerPackages = catalog.packages.filter(
    (aircraft) =>
      (aircraft.boundary.status === 'official_partner_candidate' ||
        aircraft.boundary.status === 'official_partner_allowed') &&
      aircraft.packageRole === 'flyable',
  );
  const partnerCandidatePackages = partnerPackages.filter(
    (aircraft) => aircraft.boundary.status === 'official_partner_candidate',
  );
  const partnerAllowedPackages = partnerPackages.filter(
    (aircraft) => aircraft.boundary.status === 'official_partner_allowed',
  );
  if (partnerCandidatePackages.length !== partnerCandidates.aircraft.length) {
    throw new Error(
      `官方合作方候选包数量不一致：目录 ${partnerCandidatePackages.length}，候选清单 ${partnerCandidates.aircraft.length}。`,
    );
  }
  if (partnerAllowedPackages.length !== 1) {
    throw new Error(`官方合作方允许包数量应为 1，实际为 ${partnerAllowedPackages.length}。`);
  }

  const modelsByPackage = new Map<string, InventoryModel[]>();
  for (const model of inventory.models) {
    for (const evidence of model.localPackageEvidence) {
      const models = modelsByPackage.get(evidence.packageName) ?? [];
      models.push(model);
      modelsByPackage.set(evidence.packageName, models);
    }
  }

  const officialFixedWingPackages = officialPackages.filter((aircraft) =>
    (modelsByPackage.get(aircraft.packageName) ?? []).some(
      (model) => model.category === '固定翼',
    ),
  );
  const excludedNonFixedWingPackages = officialPackages.filter(
    (aircraft) => !officialFixedWingPackages.includes(aircraft),
  );
  if (officialFixedWingPackages.length !== 32) {
    throw new Error(
      `固定翼官方包数量应为 32，实际为 ${officialFixedWingPackages.length}。`,
    );
  }

  const partnerFixedWingPackages = partnerPackages.filter((aircraft) =>
    (modelsByPackage.get(aircraft.packageName) ?? []).some(
      (model) => model.category === '固定翼',
    ),
  );
  const excludedPartnerNonFixedWingPackages = partnerPackages.filter(
    (aircraft) => !partnerFixedWingPackages.includes(aircraft),
  );
  if (partnerFixedWingPackages.length !== 26) {
    throw new Error(
      `官方合作方固定翼包数量应为 26，实际为 ${partnerFixedWingPackages.length}。`,
    );
  }
  const inScopePackages = [...officialFixedWingPackages, ...partnerFixedWingPackages];

  const probeByTitle = new Map<string, ProbeResult>();
  for (const result of probeData.results) {
    if (/^(?:Asobo|Microsoft) PassiveAircraft\b/iu.test(result.aircraft_title)) continue;
    if (probeByTitle.has(result.aircraft_title)) {
      throw new Error(`批量探测结果存在重复标题，无法安全匹配：${result.aircraft_title}`);
    }
    probeByTitle.set(result.aircraft_title, result);
  }

  const packageReview = inScopePackages.map((aircraft) => {
    const models = modelsByPackage.get(aircraft.packageName) ?? [];
    const inventoryTitles = models.flatMap((model) => model.observedRuntimeTitles);
    const titlesByName = new Map(inventoryTitles.map((title) => [title.title, title]));
    const observedTitles = [...titlesByName.values()];
    const matched = observedTitles
      .map((inventoryTitle) => {
        const result = probeByTitle.get(inventoryTitle.title);
        return result ? resultRecord(result, inventoryTitle) : null;
      })
      .filter((result): result is NonNullable<typeof result> => result !== null);
    const supported = matched.filter((result) => result.runtimeStatus === 'supported');
    const unsupported = matched.filter((result) => result.runtimeStatus === 'unsupported');
    const unknown = matched.filter((result) => result.runtimeStatus === 'unknown');

    let decision: 'candidate_included' | 'excluded_runtime_unsupported' | 'pending_not_observed';
    if (supported.length > 0) decision = 'candidate_included';
    else if (matched.length > 0) decision = 'excluded_runtime_unsupported';
    else decision = 'pending_not_observed';

    return {
      packageName: aircraft.packageName,
      officialTitle: aircraft.title,
      boundaryStatus: aircraft.boundary.status,
      creator: aircraft.creator ?? null,
      manufacturer: aircraft.manufacturer ?? null,
      inventoryModelNames: unique(models.map((model) => model.name)),
      inventoryRuntimeTitles: observedTitles.map((title) => title.title),
      matchedRuntimeTitles: matched,
      supportedRuntimeTitles: supported,
      unsupportedRuntimeTitles: unsupported,
      unknownRuntimeTitles: unknown,
      decision,
    };
  });

  const candidates = packageReview.flatMap((review) =>
    review.supportedRuntimeTitles.map((runtime) => ({
      packageName: review.packageName,
      officialTitle: review.officialTitle,
      boundaryStatus: review.boundaryStatus,
      creator: review.creator,
      manufacturer: review.manufacturer,
      aircraftTitle: runtime.aircraftTitle,
      runtimeStatus: runtime.runtimeStatus,
      autopilotAvailable: runtime.autopilotAvailable,
      runtimeModeResults: runtime.runtimeModeResults,
      writeMethod: null,
      supportedOperations: [],
      verificationStatus: 'pending_player_aircraft_write_test' as const,
      evidence: {
        officialPackage: pathLabel(catalogPath),
        inventoryMapping: pathLabel(inventoryPath),
        runtimeProbe: pathLabel(parsed.probePath),
        identityNote:
          '通过已审阅的 packageName → observedRuntimeTitles 名称映射得到；最终写入前仍需在用户飞机上验证。',
      },
    })),
  );

  const collectedAt =
    typeof probeSource.collectedAt === 'string'
      ? probeSource.collectedAt
      : new Date().toISOString();
  const output = {
    schemaVersion: 1,
    generatedAt: collectedAt,
    status: 'candidate_only' as const,
    title: '官方及合作方固定翼飞机自动驾驶候选清单（运行时交集）',
    policy: {
      scope: 'fixed_wing_only',
      officialPackageFilter:
        'boundary.status=official 或 official_partner_candidate/allowed、packageRole=flyable，且 aircraft-inventory.category=固定翼',
      runtimeFilter: '只保留批量探测 status=supported 的运行时标题',
      identityRule: '使用 packageName 作为包级身份；运行时标题只作为当前候选匹配字段',
      userFacingWhitelist: 'single_list',
      writeMethodRule:
        '最终名单内部按机型记录 key_event 或 input_event；目前尚未把任一写入方式标记为已验证。',
      excludedByDefault: [
        '未被官方目录标记为 official 或 official_partner 的包',
        '直升机和热气球等非固定翼官方可驾驶包',
        '官方包但运行时明确没有自动驾驶的标题',
      ],
    },
    sources: {
      officialAircraftCatalog: pathLabel(catalogPath),
      officialPartnerCandidates: pathLabel(partnerCandidatesPath),
      aircraftInventory: pathLabel(inventoryPath),
      runtimeProbeArtifact: pathLabel(parsed.probePath),
    },
    summary: {
      officialFlyablePackageCount: officialPackages.length,
      officialFixedWingPackageCount: officialFixedWingPackages.length,
      excludedNonFixedWingPackageCount: excludedNonFixedWingPackages.length,
      officialPartnerCandidatePackageCount: partnerCandidatePackages.length,
      officialPartnerAllowedPackageCount: partnerAllowedPackages.length,
      officialPartnerFixedWingPackageCount: partnerFixedWingPackages.length,
      excludedPartnerNonFixedWingPackageCount: excludedPartnerNonFixedWingPackages.length,
      inScopeFixedWingPackageCount: inScopePackages.length,
      packagesWithSupportedRuntimeTitles: packageReview.filter(
        (review) => review.supportedRuntimeTitles.length > 0,
      ).length,
      packagesWithOnlyUnsupportedRuntimeTitles: packageReview.filter(
        (review) => review.decision === 'excluded_runtime_unsupported',
      ).length,
      packagesWithoutObservedRuntimeTitles: packageReview.filter(
        (review) => review.decision === 'pending_not_observed',
      ).length,
      supportedRuntimeTitleCount: candidates.length,
      unsupportedRuntimeTitleCount: packageReview.reduce(
        (count, review) => count + review.unsupportedRuntimeTitles.length,
        0,
      ),
      unknownRuntimeTitleCount: packageReview.reduce(
        (count, review) => count + review.unknownRuntimeTitles.length,
        0,
      ),
      supportedUniqueRuntimeTitleCount: new Set(
        candidates.map((candidate) => candidate.aircraftTitle),
      ).size,
      finalWhitelistReady: false,
      finalWhitelistBlocker: '每个候选机型仍需在用户飞机上验证 Key Event 或 Input Event 写入和独立读回。',
    },
    candidates,
    excludedNonFixedWing: [...excludedNonFixedWingPackages, ...excludedPartnerNonFixedWingPackages].map(
      (aircraft) => ({
      packageName: aircraft.packageName,
      officialTitle: aircraft.title,
      boundaryStatus: aircraft.boundary.status,
      category: unique(
        (modelsByPackage.get(aircraft.packageName) ?? []).map((model) => model.category),
      ),
      reason: '当前项目暂时只维护固定翼飞机。',
    }),
    ),
    packageReview,
  };

  await mkdir(dirname(parsed.outputPath), { recursive: true });
  await writeFile(parsed.outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath: parsed.outputPath,
        officialFlyablePackageCount: officialPackages.length,
        officialFixedWingPackageCount: officialFixedWingPackages.length,
        excludedNonFixedWingPackageCount: excludedNonFixedWingPackages.length,
        officialPartnerCandidatePackageCount: partnerCandidatePackages.length,
        officialPartnerAllowedPackageCount: partnerAllowedPackages.length,
        officialPartnerFixedWingPackageCount: partnerFixedWingPackages.length,
        excludedPartnerNonFixedWingPackageCount: excludedPartnerNonFixedWingPackages.length,
        inScopeFixedWingPackageCount: inScopePackages.length,
        candidatePackageCount: output.summary.packagesWithSupportedRuntimeTitles,
        candidateRuntimeTitleCount: output.summary.supportedRuntimeTitleCount,
        unsupportedRuntimeTitleCount: output.summary.unsupportedRuntimeTitleCount,
        pendingPackageCount: output.summary.packagesWithoutObservedRuntimeTitles,
      },
      null,
      2,
    )}\n`,
  );
}
