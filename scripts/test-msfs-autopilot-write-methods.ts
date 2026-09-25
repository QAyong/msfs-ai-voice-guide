import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { loadMsfsConfig } from '../src/config/schema.js';
import { MsfsCliClient } from '../src/msfs/cli-client.js';
import {
  autopilotKeyEvents,
  autopilotTargetKeyEvents,
  encodeAutopilotTargetData,
  isAutopilotTargetSlotIndexValid,
  type AutopilotTargetKey,
} from '../src/msfs/autopilot-key-events.js';
import {
  autopilotAvailabilityDataSchema,
  inputEventListDataSchema,
  inputEventParamsDataSchema,
  inputEventValueDataSchema,
  inputEventSetDataSchema,
  keyEventDataSchema,
  simvarItemSchema,
  simvarBatchDataSchema,
  stringSimvarDataSchema,
  systemStateDataSchema,
} from '../src/msfs/schemas.js';
import { resolveMsfsCliPath } from '../src/msfs/path.js';

const projectRoot = resolve(import.meta.dirname, '..');
const candidatePath = join(
  projectRoot,
  'docs',
  'msfs',
  'autopilot',
  'official-autopilot-candidate-filter.json',
);
const outputDirectory = join(projectRoot, 'docs', 'msfs', 'autopilot', 'write-tests');
const settleMs = 300;
const readbackPollMs = 100;
const readbackTimeoutMs = 3_000;

try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // The caller may provide MSFS_* values through the process environment.
}

const operationIds = [
  'ap',
  'fd',
  'heading',
  'navigation',
  'altitude',
  'vertical_speed',
  'flight_level_change',
] as const;

const targetOperationIds = [
  'target_heading',
  'target_altitude',
  'target_speed',
  'target_vertical_speed',
] as const;

type OperationId = (typeof operationIds)[number];
type TargetOperationId = (typeof targetOperationIds)[number];
type Method = 'key_event' | 'input_event' | 'both';

const inputBindingSchema = z
  .object({
    name: z.string().min(1),
    onValue: z.number().finite().optional(),
    offValue: z.number().finite().optional(),
    readback: z.string().min(1).optional(),
  })
  .passthrough();

const candidateSchema = z.object({
  packageName: z.string().min(1),
  officialTitle: z.string().min(1),
  aircraftTitle: z.string().min(1),
  boundaryStatus: z.string().min(1),
  runtimeStatus: z.literal('supported'),
  inputEventBindings: z.record(z.string(), inputBindingSchema).optional(),
});

const candidateFileSchema = z.object({
  status: z.literal('candidate_only'),
  candidates: z.array(candidateSchema),
});

const inputMapSchema = z.record(z.string(), inputBindingSchema);

type Candidate = z.infer<typeof candidateSchema>;
type InputBinding = z.infer<typeof inputBindingSchema>;
type CommandFailure = { code: string; message: string };
type SimvarState = Record<string, number>;

type CliOptions = {
  write: boolean;
  method: Method;
  allowGround: boolean;
  candidatePath: string;
  inputMapPath?: string;
  outputPath: string;
  expectedTitle?: string;
  operations: OperationId[];
  targetOperations: TargetOperationId[];
};

type OperationDefinition = {
  id: OperationId;
  label: string;
  readback: string;
  keyEvent: { kind: 'on_off'; on: string; off: string } | { kind: 'toggle'; event: string };
};

type TargetOperationDefinition = {
  id: TargetOperationId;
  target: AutopilotTargetKey;
  label: string;
  event: string;
  readback: string;
  readbackUnit: string;
  slotIndexSimvar: string;
  tolerance: number;
  chooseValue: (current: number) => number;
};

type TargetRestoreEntry = {
  definition: TargetOperationDefinition;
  initialValue: number;
  slotIndex: number;
};

const operationDefinitions: Record<OperationId, OperationDefinition> = {
  ap: {
    id: 'ap',
    label: '自动驾驶总开关',
    readback: 'AUTOPILOT MASTER',
    keyEvent: {
      kind: 'on_off',
      on: autopilotKeyEvents.autopilotOn,
      off: autopilotKeyEvents.autopilotOff,
    },
  },
  fd: {
    id: 'fd',
    label: '飞行指引',
    readback: 'AUTOPILOT FLIGHT DIRECTOR ACTIVE',
    keyEvent: { kind: 'toggle', event: autopilotKeyEvents.flightDirectorToggle },
  },
  heading: {
    id: 'heading',
    label: 'HDG 航向模式',
    readback: 'AUTOPILOT HEADING LOCK',
    keyEvent: {
      kind: 'on_off',
      on: autopilotKeyEvents.headingOn,
      off: autopilotKeyEvents.headingOff,
    },
  },
  navigation: {
    id: 'navigation',
    label: 'NAV 导航模式',
    readback: 'AUTOPILOT NAV1 LOCK',
    keyEvent: {
      kind: 'on_off',
      on: autopilotKeyEvents.navigationOn,
      off: autopilotKeyEvents.navigationOff,
    },
  },
  altitude: {
    id: 'altitude',
    label: 'ALT 高度保持模式',
    readback: 'AUTOPILOT ALTITUDE LOCK',
    keyEvent: {
      kind: 'on_off',
      on: autopilotKeyEvents.altitudeOn,
      off: autopilotKeyEvents.altitudeOff,
    },
  },
  vertical_speed: {
    id: 'vertical_speed',
    label: 'VS 垂直速度模式',
    readback: 'AUTOPILOT VERTICAL HOLD',
    keyEvent: {
      kind: 'on_off',
      on: autopilotKeyEvents.verticalSpeedOn,
      off: autopilotKeyEvents.verticalSpeedOff,
    },
  },
  flight_level_change: {
    id: 'flight_level_change',
    label: 'FLC 高度层改变模式',
    readback: 'AUTOPILOT FLIGHT LEVEL CHANGE',
    keyEvent: {
      kind: 'on_off',
      on: autopilotKeyEvents.flightLevelChangeOn,
      off: autopilotKeyEvents.flightLevelChangeOff,
    },
  },
};

const targetOperationDefinitions: Record<TargetOperationId, TargetOperationDefinition> = {
  target_heading: {
    id: 'target_heading',
    target: 'heading',
    label: '目标航向',
    event: autopilotTargetKeyEvents.heading.event,
    readback: autopilotTargetKeyEvents.heading.readbackSimvar,
    readbackUnit: 'degrees',
    slotIndexSimvar: autopilotTargetKeyEvents.heading.slotIndexSimvar,
    tolerance: 1,
    chooseValue: (current) => (current >= 350 ? current - 10 : current + 10),
  },
  target_altitude: {
    id: 'target_altitude',
    target: 'altitude',
    label: '目标高度',
    event: autopilotTargetKeyEvents.altitude.event,
    readback: autopilotTargetKeyEvents.altitude.readbackSimvar,
    readbackUnit: 'feet',
    slotIndexSimvar: autopilotTargetKeyEvents.altitude.slotIndexSimvar,
    tolerance: 1,
    chooseValue: (current) => current + 1_000,
  },
  target_speed: {
    id: 'target_speed',
    target: 'speed',
    label: '目标速度',
    event: autopilotTargetKeyEvents.speed.event,
    readback: autopilotTargetKeyEvents.speed.readbackSimvar,
    readbackUnit: 'knots',
    slotIndexSimvar: autopilotTargetKeyEvents.speed.slotIndexSimvar,
    tolerance: 1,
    chooseValue: (current) => Math.max(20, current + 5),
  },
  target_vertical_speed: {
    id: 'target_vertical_speed',
    target: 'verticalSpeed',
    label: '目标垂直速度',
    event: autopilotTargetKeyEvents.verticalSpeed.event,
    readback: autopilotTargetKeyEvents.verticalSpeed.readbackSimvar,
    readbackUnit: 'feet per minute',
    slotIndexSimvar: autopilotTargetKeyEvents.verticalSpeed.slotIndexSimvar,
    tolerance: 1,
    chooseValue: (current) => (current === -500 ? 500 : -500),
  },
};

const stateItems = [
  ['AUTOPILOT AVAILABLE', 'bool'],
  ['AUTOPILOT MASTER', 'bool'],
  ['AUTOPILOT FLIGHT DIRECTOR ACTIVE', 'bool'],
  ['AUTOPILOT HEADING LOCK', 'bool'],
  ['AUTOPILOT HEADING LOCK DIR', 'degrees'],
  ['AUTOPILOT HEADING SLOT INDEX', 'number'],
  ['NAV AVAILABLE:1', 'bool'],
  ['AUTOPILOT NAV1 LOCK', 'bool'],
  ['AUTOPILOT ALTITUDE LOCK', 'bool'],
  ['AUTOPILOT ALTITUDE LOCK VAR', 'feet'],
  ['AUTOPILOT ALTITUDE SLOT INDEX', 'number'],
  ['AUTOPILOT VERTICAL HOLD', 'bool'],
  ['AUTOPILOT VERTICAL HOLD VAR', 'feet per minute'],
  ['AUTOPILOT VS SLOT INDEX', 'number'],
  ['AUTOPILOT FLIGHT LEVEL CHANGE', 'bool'],
  ['AUTOPILOT AIRSPEED HOLD VAR', 'knots'],
  ['AUTOPILOT SPEED SLOT INDEX', 'number'],
  ['SIM ON GROUND', 'bool'],
  ['PLANE ALTITUDE', 'feet'],
  ['GROUND ALTITUDE', 'feet'],
] as const;

// These variables are useful evidence, but some aircraft do not expose every
// optional navigation/configuration variable. They are therefore read one by
// one and do not make the whole test fail when one is unavailable.
const diagnosticStateItems = [
  ['AUTOPILOT DEFAULT ROLL MODE', 'number'],
  ['AUTOPILOT DEFAULT PITCH MODE', 'number'],
  ['AUTOPILOT ALTITUDE ARM', 'bool'],
  ['AUTOPILOT AIRSPEED HOLD', 'bool'],
  ['NAV CODES:1', 'number'],
  ['NAV BACK COURSE FLAGS:1', 'number'],
  ['GPS DRIVES NAV1', 'bool'],
  ['GPS IS ACTIVE FLIGHT PLAN', 'bool'],
] as const;

type SimvarRequestItem = readonly [name: string, unit: string];

function usage(): void {
  process.stdout.write(
    `用法：\n` +
      `  pnpm msfs:test:autopilot-write\n` +
      `  pnpm msfs:test:autopilot-write -- --write --method key_event --target-operations target_altitude\n\n` +
      `默认只读当前用户飞机。只有明确传入 --write 才会发送写入。\n\n` +
      `选项：\n` +
      `  --write                 允许发送 Key Event/Input Event，并在结束时恢复状态\n` +
      `  --method <value>        key_event、input_event 或 both，默认 key_event\n` +
      `  --allow-ground         允许在地面发送写入，仅用于诊断，不作为最终白名单证据\n` +
      `  --candidate <path>      候选清单，默认 official-autopilot-candidate-filter.json\n` +
      `  --input-map <path>      当前飞机的 Input Event 名称和值映射 JSON\n` +
      `  --operations <list>     逗号分隔：ap,fd,heading,navigation,altitude,vertical_speed,flight_level_change\n` +
      `  --target-operations <list> 目标值 Key Event：target_heading,target_altitude,target_speed,target_vertical_speed；单独指定时不运行模式测试\n` +
      `  --title <title>         要求当前 TITLE 精确匹配指定标题\n` +
      `  --output <path>         测试结果输出路径\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parseMethod(value: string): Method {
  if (value === 'key_event' || value === 'input_event' || value === 'both') return value;
  throw new Error('--method 只能是 key_event、input_event 或 both。');
}

function parseOperations(value: string): OperationId[] {
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error('--operations 不能为空。');
  const unknown = values.filter(
    (item): item is string => !(operationIds as readonly string[]).includes(item),
  );
  if (unknown.length > 0) throw new Error(`未知自动驾驶操作：${unknown.join(', ')}`);
  return [...new Set(values)] as OperationId[];
}

function parseTargetOperations(value: string): TargetOperationId[] {
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error('--target-operations 不能为空。');
  const unknown = values.filter(
    (item): item is string => !(targetOperationIds as readonly string[]).includes(item),
  );
  if (unknown.length > 0) throw new Error(`未知自动驾驶目标操作：${unknown.join(', ')}`);
  return [...new Set(values)] as TargetOperationId[];
}

function timestampForFile(): string {
  return new Date().toISOString().replaceAll(/[-:.]/gu, '');
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let write = false;
  let method: Method = 'key_event';
  let allowGround = false;
  let candidateFilePath = candidatePath;
  let inputMapPath: string | undefined;
  let outputPath = join(outputDirectory, `${timestampForFile()}-autopilot-write-test.json`);
  let expectedTitle: string | undefined;
  let operations = [...operationIds];
  let operationsSpecified = false;
  let targetOperations: TargetOperationId[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--write') {
      write = true;
      continue;
    }
    if (argument === '--allow-ground') {
      allowGround = true;
      continue;
    }
    if (argument === '--method') {
      method = parseMethod(takeValue(argv, index, '--method'));
      index += 1;
      continue;
    }
    if (argument === '--candidate') {
      candidateFilePath = resolve(projectRoot, takeValue(argv, index, '--candidate'));
      index += 1;
      continue;
    }
    if (argument === '--input-map') {
      inputMapPath = resolve(projectRoot, takeValue(argv, index, '--input-map'));
      index += 1;
      continue;
    }
    if (argument === '--operations') {
      operations = parseOperations(takeValue(argv, index, '--operations'));
      operationsSpecified = true;
      index += 1;
      continue;
    }
    if (argument === '--target-operations') {
      targetOperations = parseTargetOperations(takeValue(argv, index, '--target-operations'));
      index += 1;
      continue;
    }
    if (argument === '--title') {
      expectedTitle = takeValue(argv, index, '--title');
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

  // A target-only command must really be target-only. Keep the historical
  // default (all mode operations) when no target list is requested, but do not
  // silently append every mode to an explicitly selected target test.
  if (!operationsSpecified && targetOperations.length > 0) operations = [];

  return {
    write,
    method,
    allowGround,
    candidatePath: candidateFilePath,
    ...(inputMapPath ? { inputMapPath } : {}),
    outputPath,
    ...(expectedTitle ? { expectedTitle } : {}),
    operations,
    targetOperations,
  };
}

function failureOf(result: {
  status: 'unavailable';
  code: string;
  message: string;
}): CommandFailure {
  return { code: result.code, message: result.message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldTestMethod(method: Method, target: Exclude<Method, 'both'>): boolean {
  return method === 'both' || method === target;
}

function asBoolean(state: SimvarState, name: string): boolean | undefined {
  const value = state[name];
  if (value === 0) return false;
  if (value === 1) return true;
  return undefined;
}

function stateSnapshot(state: SimvarState | undefined): Record<string, number> | null {
  return state ? { ...state } : null;
}

function numberOrNull(state: SimvarState, name: string): number | null {
  const value = state[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function slotIndexOrNull(
  state: SimvarState,
  name: string,
  target: AutopilotTargetKey,
): number | null {
  const value = numberOrNull(state, name);
  return value !== null && isAutopilotTargetSlotIndexValid(target, value) ? value : null;
}

function indexedTargetReadback(definition: TargetOperationDefinition, slotIndex: number): string {
  return `${definition.readback}:${slotIndex}`;
}

async function readTargetState(
  client: MsfsCliClient,
  definition: TargetOperationDefinition,
  slotIndex: number,
  includeDiagnostics = false,
): Promise<StateReadResult> {
  return readState(client, includeDiagnostics, [
    [indexedTargetReadback(definition, slotIndex), definition.readbackUnit],
  ]);
}

function circularDifference(first: number, second: number): number {
  const normalize = (value: number) => {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  };
  const difference = Math.abs(normalize(first) - normalize(second));
  return Math.min(difference, 360 - difference);
}

function flagIsSet(state: SimvarState, name: string, bit: number): boolean | null {
  const value = numberOrNull(state, name);
  return value === null ? null : (Math.trunc(value) & (1 << bit)) !== 0;
}

function navigationPrecondition(state: SimvarState): Record<string, unknown> {
  const gpsDrivesNav1 = asBoolean(state, 'GPS DRIVES NAV1');
  const gpsFlightPlanActive = asBoolean(state, 'GPS IS ACTIVE FLIGHT PLAN');
  const radioStationActive = flagIsSet(state, 'NAV BACK COURSE FLAGS:1', 3);
  const radioSignalMissing = flagIsSet(state, 'NAV CODES:1', 3);
  const gpsSourceReady = gpsDrivesNav1 === true && gpsFlightPlanActive === true;
  const radioSourceReady = radioStationActive === true && radioSignalMissing === false;

  return {
    navAvailable: asBoolean(state, 'NAV AVAILABLE:1') ?? null,
    gpsDrivesNav1: gpsDrivesNav1 ?? null,
    gpsFlightPlanActive: gpsFlightPlanActive ?? null,
    radioStationActive,
    radioSignalMissing,
    source: gpsSourceReady ? 'gps' : radioSourceReady ? 'nav1' : null,
    sourceReady: gpsSourceReady || radioSourceReady,
  };
}

function operationPrecondition(
  definition: OperationDefinition,
  state: SimvarState,
  allowGround: boolean,
): Record<string, unknown> {
  const autopilotAvailable = asBoolean(state, 'AUTOPILOT AVAILABLE');
  const onGround = asBoolean(state, 'SIM ON GROUND');
  const planeAltitude = numberOrNull(state, 'PLANE ALTITUDE');
  const groundAltitude = numberOrNull(state, 'GROUND ALTITUDE');
  const aboveGroundFeet =
    planeAltitude !== null && groundAltitude !== null ? planeAltitude - groundAltitude : null;
  const navigation = navigationPrecondition(state);
  const warnings = [
    '飞机配置中的 min_feet_for_ap 和 min_flight_time_for_ap 不是通用运行时 SimVar；最终证据应在稳定空中状态采集。',
  ];

  const base = {
    status: 'ready' as const,
    autopilotAvailable: autopilotAvailable ?? null,
    onGround: onGround ?? null,
    planeAltitudeFeet: planeAltitude,
    groundAltitudeFeet: groundAltitude,
    aboveGroundFeet,
    navigation,
    warnings,
  };

  if (onGround === undefined) {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: '无法确认 SIM ON GROUND，拒绝发送写入。',
    };
  }
  if (onGround && !allowGround) {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: '当前飞机在地面；默认不在地面发送自动驾驶写入。需要诊断时显式加入 --allow-ground。',
    };
  }
  if (definition.id !== 'fd' && autopilotAvailable !== true) {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: 'AUTOPILOT AVAILABLE 不是 1，未发送该自动驾驶模式写入。',
    };
  }
  if (definition.id === 'navigation') {
    if (navigation.navAvailable !== true) {
      return {
        ...base,
        status: 'skipped_precondition',
        reason: 'NAV AVAILABLE:1 不是 1，未发送 NAV 写入。',
      };
    }
    if (navigation.sourceReady !== true) {
      return {
        ...base,
        status: 'skipped_precondition',
        reason:
          'NAV1 没有确认有效导航源：需要 GPS 驱动 NAV1 且有活动航路，或 NAV1 已捕获有效台站信号。',
      };
    }
  }
  return base;
}

function targetOperationPrecondition(
  state: SimvarState,
  allowGround: boolean,
): Record<string, unknown> {
  const autopilotAvailable = asBoolean(state, 'AUTOPILOT AVAILABLE');
  const onGround = asBoolean(state, 'SIM ON GROUND');
  const planeAltitude = numberOrNull(state, 'PLANE ALTITUDE');
  const groundAltitude = numberOrNull(state, 'GROUND ALTITUDE');
  const aboveGroundFeet =
    planeAltitude !== null && groundAltitude !== null ? planeAltitude - groundAltitude : null;
  const base = {
    status: 'ready' as const,
    autopilotAvailable: autopilotAvailable ?? null,
    onGround: onGround ?? null,
    planeAltitudeFeet: planeAltitude,
    groundAltitudeFeet: groundAltitude,
    aboveGroundFeet,
    warnings: [
      '目标值测试只验证 Key Event 的目标参数和独立 SimVar 读回，不证明飞机会按该目标实际爬升或下降。',
    ],
  };

  if (onGround === undefined) {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: '无法确认 SIM ON GROUND，拒绝发送写入。',
    };
  }
  if (onGround && !allowGround) {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: '当前飞机在地面；默认不发送目标值写入。需要诊断时显式加入 --allow-ground。',
    };
  }
  if (autopilotAvailable !== true) {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: 'AUTOPILOT AVAILABLE 不是 1，未发送目标值写入。',
    };
  }
  return base;
}

type OptionalStateError = { name: string; error: CommandFailure };

type StateReadResult =
  | { status: 'ok'; state: SimvarState; optionalErrors: OptionalStateError[] }
  | { status: 'unavailable'; error: CommandFailure };

async function readState(
  client: MsfsCliClient,
  includeDiagnostics = false,
  extraItems: readonly SimvarRequestItem[] = [],
): Promise<StateReadResult> {
  const requestedItems: readonly SimvarRequestItem[] = [...stateItems, ...extraItems];
  const result = await client.execute(
    [
      'simvar',
      'batch',
      '--items',
      requestedItems.map(([name, unit]) => `${name}|${unit}`).join(';'),
    ],
    simvarBatchDataSchema,
  );
  if (result.status !== 'ok') return { status: 'unavailable', error: failureOf(result) };
  const state = Object.fromEntries(result.data.items.map((item) => [item.name, item.value]));
  const optionalErrors: OptionalStateError[] = [];

  if (includeDiagnostics) {
    for (const [name, unit] of diagnosticStateItems) {
      const diagnostic = await client.execute(
        ['simvar', 'get', '--name', name, '--unit', unit],
        simvarItemSchema,
      );
      if (diagnostic.status === 'ok') {
        state[name] = diagnostic.data.value;
      } else {
        optionalErrors.push({ name, error: failureOf(diagnostic) });
      }
    }
  }

  return {
    status: 'ok',
    state,
    optionalErrors,
  };
}

async function readString(client: MsfsCliClient, name: string) {
  const result = await client.execute(
    ['simvar', 'get', '--name', name, '--unit', 'string', '--datatype', 'string'],
    stringSimvarDataSchema,
  );
  return result.status === 'ok'
    ? { status: 'ok' as const, value: result.data.value }
    : { status: 'unavailable' as const, error: failureOf(result) };
}

async function readLoadedPath(client: MsfsCliClient) {
  const result = await client.execute(
    ['system', 'state', '--name', 'AircraftLoaded'],
    systemStateDataSchema,
  );
  return result.status === 'ok'
    ? { status: 'ok' as const, value: result.data.value.string }
    : { status: 'unavailable' as const, error: failureOf(result) };
}

async function readAvailability(client: MsfsCliClient) {
  const result = await client.execute(
    ['simvar', 'get', '--name', 'AUTOPILOT AVAILABLE', '--unit', 'bool'],
    autopilotAvailabilityDataSchema,
  );
  return result.status === 'ok'
    ? { status: 'ok' as const, value: result.data.value }
    : { status: 'unavailable' as const, error: failureOf(result) };
}

async function sendKeyEvent(
  client: MsfsCliClient,
  event: string,
  data?: readonly number[],
): Promise<{ status: 'ok' } | { status: 'unavailable'; error: CommandFailure }> {
  const result = await client.execute(
    [
      'key-event',
      'send',
      '--name',
      event,
      ...(data && data.length > 0 ? ['--data', data.join(',')] : []),
      '--unsafe',
    ],
    keyEventDataSchema,
  );
  return result.status === 'ok'
    ? { status: 'ok' as const }
    : { status: 'unavailable' as const, error: failureOf(result) };
}

async function sendInputEvent(
  client: MsfsCliClient,
  hash: string,
  value: number,
): Promise<{ status: 'ok'; value: number } | { status: 'unavailable'; error: CommandFailure }> {
  const result = await client.execute(
    ['input', 'set', '--hash', hash, '--value', String(value), '--unsafe'],
    inputEventSetDataSchema,
  );
  return result.status === 'ok'
    ? { status: 'ok' as const, value: result.data.value }
    : { status: 'unavailable' as const, error: failureOf(result) };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, settleMs));
}

type ReadbackWaitResult =
  | {
      status: 'matched' | 'timeout';
      state: SimvarState;
      attempts: number;
      elapsedMs: number;
    }
  | {
      status: 'unavailable';
      state: SimvarState | null;
      attempts: number;
      elapsedMs: number;
      error: CommandFailure;
    };

async function waitForReadback(
  client: MsfsCliClient,
  readback: string,
  expected: boolean,
): Promise<ReadbackWaitResult> {
  return waitForReadbackValue(
    client,
    readback,
    (value) => (value === 0 ? false : value === 1 ? true : undefined) === expected,
  );
}

async function waitForReadbackValue(
  client: MsfsCliClient,
  readback: string,
  matches: (value: number | undefined) => boolean,
  readStateOverride?: () => Promise<StateReadResult>,
): Promise<ReadbackWaitResult> {
  const startedAt = Date.now();
  let attempts = 0;
  let lastState: SimvarState | null = null;

  while (true) {
    const read = await (readStateOverride ? readStateOverride() : readState(client));
    attempts += 1;
    const elapsedMs = Date.now() - startedAt;
    if (read.status !== 'ok') {
      return {
        status: 'unavailable',
        state: lastState,
        attempts,
        elapsedMs,
        error: read.error,
      };
    }
    lastState = read.state;
    if (matches(read.state[readback])) {
      return { status: 'matched', state: read.state, attempts, elapsedMs };
    }
    if (elapsedMs >= readbackTimeoutMs) {
      return { status: 'timeout', state: read.state, attempts, elapsedMs };
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, readbackPollMs));
  }
}

function modeResultStatus(
  supported: boolean,
  steps: Array<Record<string, unknown>>,
): 'supported' | 'readback_timeout' | 'readback_mismatch' {
  if (supported) return 'supported';
  return steps.some((step) => step.status === 'readback_timeout')
    ? 'readback_timeout'
    : 'readback_mismatch';
}

function targetValueMatches(
  definition: TargetOperationDefinition,
  actual: number | undefined,
  expected: number,
): boolean {
  if (actual === undefined || !Number.isFinite(actual)) return false;
  return definition.target === 'heading'
    ? circularDifference(actual, expected) <= definition.tolerance
    : Math.abs(actual - expected) <= definition.tolerance;
}

function relevantInputEvent(name: string): boolean {
  return /(AUTOPILOT|FLIGHT[_ ]DIRECTOR|HEADING|ALTITUDE|VERTICAL|FLIGHT[_ ]LEVEL|NAV|FLC)/iu.test(
    name,
  );
}

async function inspectInputEvents(
  client: MsfsCliClient,
  requiredNames: Set<string>,
): Promise<
  | { status: 'ok'; events: Array<Record<string, unknown>> }
  | { status: 'unavailable'; error: CommandFailure; events: [] }
> {
  const list = await client.execute(['input', 'list'], inputEventListDataSchema);
  if (list.status !== 'ok') return { status: 'unavailable', error: failureOf(list), events: [] };

  const deduplicated = [
    ...new Map(
      list.data.events
        .filter((event) => relevantInputEvent(event.name) || requiredNames.has(event.name))
        .map((event) => [`${event.name}\u001f${event.hash}`, event]),
    ).values(),
  ];
  const events: Array<Record<string, unknown>> = [];
  for (const event of deduplicated) {
    const params = await client.execute(
      ['input', 'params', '--hash', event.hash],
      inputEventParamsDataSchema,
    );
    const value = await client.execute(
      ['input', 'get', '--hash', event.hash],
      inputEventValueDataSchema,
    );
    events.push({
      name: event.name,
      hash: event.hash,
      type: event.type,
      params: params.status === 'ok' ? params.data.params : { error: failureOf(params) },
      currentValue: value.status === 'ok' ? value.data.value : { error: failureOf(value) },
    });
  }
  return { status: 'ok', events };
}

type InputInventory = Awaited<ReturnType<typeof inspectInputEvents>>;

function inputEventInfo(
  inventory: InputInventory | null,
  name: string,
): { name: string; hash: string; type: number; params: string; currentValue: number } | null {
  if (!inventory || inventory.status !== 'ok') return null;
  const event = inventory.events.find((item) => item.name === name);
  if (!event || typeof event.hash !== 'string' || typeof event.type !== 'number') return null;
  if (typeof event.params !== 'string' || typeof event.currentValue !== 'number') return null;
  return {
    name,
    hash: event.hash,
    type: event.type,
    params: event.params,
    currentValue: event.currentValue,
  };
}

function inputShapeSupported(event: { type: number; params: string }): boolean {
  return event.type === 0 && event.params.trim().toLocaleUpperCase() === ';FLOAT64';
}

async function testKeyOperation(
  client: MsfsCliClient,
  definition: OperationDefinition,
  write: boolean,
  allowGround: boolean,
): Promise<Record<string, unknown>> {
  // Each operation gets a fresh snapshot. AP mode events can affect one
  // another, so sharing one snapshot across the whole test is unsafe.
  const stateBeforeResult = await readState(client, true);
  const stateBefore = stateBeforeResult.status === 'ok' ? stateBeforeResult.state : null;
  const preconditions = stateBefore
    ? operationPrecondition(definition, stateBefore, allowGround)
    : null;
  const base = {
    method: 'key_event',
    operation: definition.id,
    label: definition.label,
    readback: definition.readback,
    keyEvent: definition.keyEvent,
    before: stateSnapshot(stateBefore ?? undefined),
    preconditions,
    optionalStateErrors: stateBeforeResult.status === 'ok' ? stateBeforeResult.optionalErrors : [],
  };
  if (!stateBefore) {
    return {
      ...base,
      status: 'unavailable',
      reason:
        stateBeforeResult.status === 'unavailable'
          ? stateBeforeResult.error.message
          : '无法读取操作前 SimVar。',
    };
  }
  if (!write) return { ...base, status: 'not_run_read_only' };
  if (preconditions?.status !== 'ready') {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: preconditions?.reason ?? '自动驾驶写入前置条件未满足。',
    };
  }

  const initial = asBoolean(stateBefore, definition.readback);
  if (initial === undefined) {
    return { ...base, status: 'unknown', reason: '操作前读回不是 0/1。' };
  }

  const steps: Array<Record<string, unknown>> = [];
  let afterOn: SimvarState | null;
  let afterOff: SimvarState | null;
  let afterToggle: SimvarState | null;
  let restore: SimvarState | null;
  let lastObserved: SimvarState | null = stateBefore;
  let writeStarted = false;
  let testResult: Record<string, unknown> | undefined;
  const remember = (result: Record<string, unknown>): Record<string, unknown> => {
    testResult = result;
    return result;
  };

  const sendAndRead = async (event: string, expected: boolean): Promise<SimvarState | null> => {
    writeStarted = true;
    const sent = await sendKeyEvent(client, event);
    if (sent.status !== 'ok') {
      steps.push({ event, expected, status: 'failed', error: sent.error });
      return null;
    }
    await settle();
    const read = await waitForReadback(client, definition.readback, expected);
    if (read.status === 'unavailable') {
      steps.push({
        event,
        expected,
        status: 'sent_readback_failed',
        attempts: read.attempts,
        elapsedMs: read.elapsedMs,
        error: read.error,
      });
      return null;
    }
    lastObserved = read.state;
    steps.push({
      event,
      expected,
      status: read.status === 'matched' ? 'sent' : 'readback_timeout',
      attempts: read.attempts,
      elapsedMs: read.elapsedMs,
      readback: read.state[definition.readback],
    });
    return read.state;
  };

  try {
    if (definition.keyEvent.kind === 'toggle') {
      let preparedOff: SimvarState | null = null;
      if (initial) {
        preparedOff = await sendAndRead(definition.keyEvent.event, false);
        if (!preparedOff || asBoolean(preparedOff, definition.readback) !== false) {
          return remember({ ...base, status: 'failed_prepare_off', steps });
        }
      }
      afterToggle = await sendAndRead(definition.keyEvent.event, true);
      afterOff = await sendAndRead(definition.keyEvent.event, false);
      if (!afterToggle || !afterOff) {
        return remember({
          ...base,
          status: 'failed',
          steps,
          preparedOff: stateSnapshot(preparedOff ?? undefined),
        });
      }
      const toggled = asBoolean(afterToggle, definition.readback);
      const toggledOff = asBoolean(afterOff, definition.readback);
      restore = initial ? await sendAndRead(definition.keyEvent.event, true) : afterOff;
      if (!restore) return remember({ ...base, status: 'restore_failed', steps });
      const restored = asBoolean(restore, definition.readback);
      return remember({
        ...base,
        status: modeResultStatus(
          toggled === true && toggledOff === false && restored === initial,
          steps,
        ),
        steps,
        preparedOff: stateSnapshot(preparedOff ?? undefined),
        afterToggle: stateSnapshot(afterToggle),
        afterOff: stateSnapshot(afterOff),
        restored: stateSnapshot(restore),
      });
    }

    if (initial) {
      const prepared = await sendAndRead(definition.keyEvent.off, false);
      if (!prepared || asBoolean(prepared, definition.readback) !== false) {
        return remember({ ...base, status: 'failed_prepare_off', steps });
      }
    }
    afterOn = await sendAndRead(definition.keyEvent.on, true);
    afterOff = await sendAndRead(definition.keyEvent.off, false);
    if (!afterOn || !afterOff) return remember({ ...base, status: 'failed', steps });
    restore = initial ? await sendAndRead(definition.keyEvent.on, true) : afterOff;
    if (!restore) return remember({ ...base, status: 'restore_failed', steps });

    const on = asBoolean(afterOn, definition.readback);
    const off = asBoolean(afterOff, definition.readback);
    const restored = asBoolean(restore, definition.readback);
    return remember({
      ...base,
      status: modeResultStatus(on === true && off === false && restored === initial, steps),
      steps,
      afterOn: stateSnapshot(afterOn),
      afterOff: stateSnapshot(afterOff),
      restored: stateSnapshot(restore),
    });
  } catch (error) {
    return remember({ ...base, status: 'error', steps, error: errorMessage(error) });
  } finally {
    if (writeStarted && initial !== undefined) {
      const current = lastObserved ? asBoolean(lastObserved, definition.readback) : undefined;
      // Explicit ON/OFF events are idempotent. Send the original state again
      // even when the last readback looked correct, because a preceding
      // readback failure may have hidden a state transition.
      const needsRestore =
        definition.keyEvent.kind === 'on_off' || current === undefined || current !== initial;
      if (needsRestore) {
        if (definition.keyEvent.kind === 'toggle' && current === undefined) {
          steps.push({
            event: definition.keyEvent.event,
            status: 'restore_unconfirmed',
            reason: '无法确认 FD 当前状态，不能安全决定是否再次 Toggle。',
          });
          if (testResult?.status === 'supported') testResult.status = 'restore_unconfirmed';
        } else {
          const desiredEvent =
            definition.keyEvent.kind === 'toggle'
              ? definition.keyEvent.event
              : initial
                ? definition.keyEvent.on
                : definition.keyEvent.off;
          const restoredState = await sendAndRead(desiredEvent, initial);
          if (!restoredState || asBoolean(restoredState, definition.readback) !== initial) {
            if (testResult?.status === 'supported') testResult.status = 'restore_failed';
          }
        }
      }
    }
  }
}

async function testKeyTargetOperation(
  client: MsfsCliClient,
  definition: TargetOperationDefinition,
  write: boolean,
  allowGround: boolean,
): Promise<Record<string, unknown>> {
  const stateBeforeResult = await readState(client, true);
  const stateBeforeBase = stateBeforeResult.status === 'ok' ? stateBeforeResult.state : null;
  const base = {
    method: 'key_event',
    operation: definition.id,
    label: definition.label,
    keyEvent: {
      name: definition.event,
      slotIndexSimvar: definition.slotIndexSimvar,
    },
    readback: definition.readback,
    tolerance: definition.tolerance,
    before: stateSnapshot(stateBeforeBase ?? undefined),
    preconditions: stateBeforeBase
      ? targetOperationPrecondition(stateBeforeBase, allowGround)
      : null,
    optionalStateErrors: stateBeforeResult.status === 'ok' ? stateBeforeResult.optionalErrors : [],
  };

  if (!stateBeforeBase) {
    return {
      ...base,
      status: 'unavailable',
      reason:
        stateBeforeResult.status === 'unavailable'
          ? stateBeforeResult.error.message
          : '无法读取目标值操作前 SimVar。',
    };
  }

  const initialSlotIndex = slotIndexOrNull(
    stateBeforeBase,
    definition.slotIndexSimvar,
    definition.target,
  );
  if (initialSlotIndex === null) {
    return {
      ...base,
      status: 'unsupported_target_slot',
      reason: `没有读到有效的目标 slot/index：${definition.slotIndexSimvar}。未发送 Key Event。`,
    };
  }

  // Target values are indexed SimVars. The unindexed form is not a strict
  // readback of the value written to the slot carried in the Key Event.
  const readback = indexedTargetReadback(definition, initialSlotIndex);
  const targetBase = {
    ...base,
    keyEvent: { ...base.keyEvent, slotIndex: initialSlotIndex },
    readback,
    readbackBase: definition.readback,
  };
  const selectedStateResult = await readTargetState(client, definition, initialSlotIndex);
  if (selectedStateResult.status !== 'ok') {
    return {
      ...targetBase,
      status: 'unavailable',
      reason: selectedStateResult.error.message,
    };
  }
  const selectedSlotIndex = slotIndexOrNull(
    selectedStateResult.state,
    definition.slotIndexSimvar,
    definition.target,
  );
  if (selectedSlotIndex !== initialSlotIndex) {
    return {
      ...targetBase,
      before: stateSnapshot(selectedStateResult.state),
      status: 'slot_changed_before_write',
      reason: `读取目标值期间 slot/index 从 ${initialSlotIndex} 变为 ${selectedSlotIndex ?? '不可用'}，拒绝发送 Key Event。`,
    };
  }

  const selectedValue = numberOrNull(selectedStateResult.state, readback);
  if (selectedValue === null) {
    return {
      ...targetBase,
      before: stateSnapshot(selectedStateResult.state),
      status: 'unknown',
      reason: `无法读取明确槽位的目标值：${readback}。`,
    };
  }
  const stateBefore = {
    ...stateBeforeBase,
    [readback]: selectedValue,
  };
  const preconditions = targetOperationPrecondition(stateBefore, allowGround);
  const strictBase = {
    ...targetBase,
    before: stateSnapshot(stateBefore),
    preconditions,
  };
  const initialValue = numberOrNull(stateBefore, readback);
  if (initialValue === null) {
    return { ...strictBase, status: 'unknown', reason: '操作前目标值不是有限数字。' };
  }
  if (!write) {
    return {
      ...strictBase,
      status: 'not_run_read_only',
      initialTargetValue: initialValue,
      initialSlotIndex,
    };
  }
  if (preconditions?.status !== 'ready') {
    return {
      ...strictBase,
      status: 'skipped_precondition',
      reason: preconditions?.reason ?? '目标值写入前置条件未满足。',
      initialTargetValue: initialValue,
      initialSlotIndex,
    };
  }

  const testValue = Math.round(definition.chooseValue(initialValue));
  if (targetValueMatches(definition, testValue, initialValue)) {
    return {
      ...strictBase,
      status: 'invalid_test_value',
      reason: '自动生成的测试目标与当前目标相同，拒绝发送以避免无效证据。',
      initialTargetValue: initialValue,
      initialSlotIndex,
      testValue,
    };
  }

  const steps: Array<Record<string, unknown>> = [];
  let writeStarted = false;
  let restoreConfirmed = false;
  let testResult: Record<string, unknown> | undefined;
  const remember = (result: Record<string, unknown>): Record<string, unknown> => {
    testResult = result;
    return result;
  };

  const sendAndRead = async (value: number, step: string): Promise<SimvarState | null> => {
    // Keep the slot captured before the first write. If a mode event changes
    // the simulator's selected slot, silently switching slots during restore
    // would make the test mutate a different target than it verified.
    const slotIndex = initialSlotIndex;
    const data = encodeAutopilotTargetData(definition.target, Math.round(value), slotIndex);
    writeStarted = true;
    const sent = await sendKeyEvent(client, definition.event, data);
    if (sent.status !== 'ok') {
      steps.push({ step, value, slotIndex, data, status: 'failed', error: sent.error });
      return null;
    }
    await settle();
    const read = await waitForReadbackValue(
      client,
      readback,
      (actual) => targetValueMatches(definition, actual, value),
      () => readTargetState(client, definition, initialSlotIndex),
    );
    if (read.status === 'unavailable') {
      steps.push({
        step,
        value,
        slotIndex,
        data,
        status: 'sent_readback_failed',
        attempts: read.attempts,
        elapsedMs: read.elapsedMs,
        error: read.error,
      });
      return null;
    }
    steps.push({
      step,
      value,
      slotIndex,
      data,
      status: read.status === 'matched' ? 'sent' : 'readback_timeout',
      attempts: read.attempts,
      elapsedMs: read.elapsedMs,
      readbackSimvar: readback,
      readback: read.state[readback],
      observedSlotIndex: numberOrNull(read.state, definition.slotIndexSimvar),
    });
    return read.state;
  };

  try {
    const afterTest = await sendAndRead(testValue, 'set_test_target');
    if (!afterTest) return remember({ ...strictBase, status: 'failed', steps });

    const afterRestore = await sendAndRead(initialValue, 'restore_original_target');
    if (!afterRestore) {
      return remember({
        ...strictBase,
        status: 'restore_failed',
        steps,
        initialTargetValue: initialValue,
        initialSlotIndex,
        testValue,
        afterTest: stateSnapshot(afterTest),
      });
    }

    const testMatched = targetValueMatches(definition, afterTest[readback], testValue);
    const restored = targetValueMatches(definition, afterRestore[readback], initialValue);
    restoreConfirmed = restored;
    return remember({
      ...strictBase,
      status: modeResultStatus(testMatched && restored, steps),
      steps,
      initialTargetValue: initialValue,
      initialSlotIndex,
      testValue,
      afterTest: stateSnapshot(afterTest),
      restored: stateSnapshot(afterRestore),
    });
  } catch (error) {
    return remember({ ...strictBase, status: 'error', steps, error: errorMessage(error) });
  } finally {
    if (writeStarted && !restoreConfirmed) {
      // A failed readback can hide a transition. Re-send the original value
      // whenever the first restoration was not explicitly confirmed.
      const restored = await sendAndRead(initialValue, 'restore_original_target_final');
      if (!restored || !targetValueMatches(definition, restored[readback], initialValue)) {
        if (testResult) testResult.status = 'restore_failed';
      }
    }
  }
}

async function restoreTargetValues(
  client: MsfsCliClient,
  targets: readonly TargetRestoreEntry[],
): Promise<Record<string, unknown> | null> {
  if (targets.length === 0) return null;

  const steps: Array<Record<string, unknown>> = [];
  let failed = false;
  for (const { definition, initialValue, slotIndex } of targets) {
    const readback = indexedTargetReadback(definition, slotIndex);
    const data = encodeAutopilotTargetData(definition.target, Math.round(initialValue), slotIndex);
    const sent = await sendKeyEvent(client, definition.event, data);
    if (sent.status !== 'ok') {
      failed = true;
      steps.push({
        operation: definition.id,
        step: 'restore_target_value',
        value: initialValue,
        slotIndex,
        data,
        status: 'failed',
        error: sent.error,
      });
      continue;
    }

    await settle();
    const read = await waitForReadbackValue(
      client,
      readback,
      (actual) => targetValueMatches(definition, actual, initialValue),
      () => readTargetState(client, definition, slotIndex),
    );
    if (read.status === 'unavailable') {
      failed = true;
      steps.push({
        operation: definition.id,
        step: 'restore_target_value',
        value: initialValue,
        slotIndex,
        data,
        status: 'readback_failed',
        attempts: read.attempts,
        elapsedMs: read.elapsedMs,
        error: read.error,
      });
      continue;
    }

    if (read.status !== 'matched') failed = true;
    steps.push({
      operation: definition.id,
      step: 'restore_target_value',
      value: initialValue,
      slotIndex,
      data,
      status: read.status === 'matched' ? 'restored' : 'timeout',
      attempts: read.attempts,
      elapsedMs: read.elapsedMs,
      readbackSimvar: readback,
      readback: read.state[readback],
    });
  }

  return {
    status: failed ? 'failed' : 'restored',
    targets: targets.map(({ definition, initialValue, slotIndex }) => ({
      operation: definition.id,
      value: initialValue,
      slotIndex,
      readback: indexedTargetReadback(definition, slotIndex),
    })),
    steps,
  };
}

async function testInputOperation(
  client: MsfsCliClient,
  definition: OperationDefinition,
  binding: InputBinding | undefined,
  event: ReturnType<typeof inputEventInfo>,
  write: boolean,
  allowGround: boolean,
): Promise<Record<string, unknown>> {
  // Input Event values can be changed by a previous Key Event test. Read the
  // player state again for every operation and use the current event value as
  // the restoration source.
  const stateBeforeResult = await readState(client, true);
  const stateBefore = stateBeforeResult.status === 'ok' ? stateBeforeResult.state : null;
  const preconditions = stateBefore
    ? operationPrecondition(definition, stateBefore, allowGround)
    : null;
  const readback = binding?.readback ?? definition.readback;
  const base = {
    method: 'input_event',
    operation: definition.id,
    label: definition.label,
    readback,
    inputBinding: binding ?? null,
    inputEvent: event
      ? { name: event.name, hash: event.hash, type: event.type, params: event.params }
      : null,
    before: stateSnapshot(stateBefore ?? undefined),
    preconditions,
    optionalStateErrors: stateBeforeResult.status === 'ok' ? stateBeforeResult.optionalErrors : [],
  };
  if (!binding)
    return { ...base, status: 'missing_binding', reason: '没有提供该操作的 Input Event 映射。' };
  if (!event)
    return { ...base, status: 'missing_event', reason: `当前飞机没有事件：${binding.name}` };
  if (!inputShapeSupported(event)) {
    return {
      ...base,
      status: 'unsupported_input_shape',
      reason: '当前 CLI 第一阶段只接受 type=0 且 params=;FLOAT64 的单数值事件。',
    };
  }
  if (binding.onValue === undefined || binding.offValue === undefined) {
    return { ...base, status: 'missing_values', reason: '映射必须同时提供 onValue 和 offValue。' };
  }
  if (binding.onValue === binding.offValue) {
    return { ...base, status: 'invalid_values', reason: 'onValue 和 offValue 不能相同。' };
  }
  if (!stateBefore) {
    return {
      ...base,
      status: 'unavailable',
      reason:
        stateBeforeResult.status === 'unavailable'
          ? stateBeforeResult.error.message
          : '无法读取操作前 SimVar。',
    };
  }
  if (!write) return { ...base, status: 'not_run_read_only' };
  if (preconditions?.status !== 'ready') {
    return {
      ...base,
      status: 'skipped_precondition',
      reason: preconditions?.reason ?? '自动驾驶写入前置条件未满足。',
    };
  }

  const initial = asBoolean(stateBefore, readback);
  if (initial === undefined) return { ...base, status: 'unknown', reason: '操作前读回不是 0/1。' };

  const steps: Array<Record<string, unknown>> = [];
  const originalInputValue = event.currentValue;
  let afterOn: SimvarState | null;
  let afterOff: SimvarState | null;
  let writeStarted = false;
  let testResult: Record<string, unknown> | undefined;
  const remember = (result: Record<string, unknown>): Record<string, unknown> => {
    testResult = result;
    return result;
  };

  const setAndRead = async (
    value: number,
    step: string,
    expected: boolean,
  ): Promise<SimvarState | null> => {
    writeStarted = true;
    const sent = await sendInputEvent(client, event.hash, value);
    if (sent.status !== 'ok') {
      steps.push({ step, value, expected, status: 'failed', error: sent.error });
      return null;
    }
    await settle();
    const read = await waitForReadback(client, readback, expected);
    if (read.status === 'unavailable') {
      steps.push({
        step,
        value,
        expected,
        status: 'sent_readback_failed',
        attempts: read.attempts,
        elapsedMs: read.elapsedMs,
        error: read.error,
      });
      return null;
    }
    steps.push({
      step,
      value,
      expected,
      status: read.status === 'matched' ? 'sent' : 'readback_timeout',
      attempts: read.attempts,
      elapsedMs: read.elapsedMs,
      readback: read.state[readback],
    });
    return read.state;
  };

  try {
    afterOn = await setAndRead(binding.onValue, 'on', true);
    afterOff = await setAndRead(binding.offValue, 'off', false);
    if (!afterOn || !afterOff) return remember({ ...base, status: 'failed', steps });
    const on = asBoolean(afterOn, readback);
    const off = asBoolean(afterOff, readback);
    return remember({
      ...base,
      status: modeResultStatus(on === true && off === false, steps),
      steps,
      afterOn: stateSnapshot(afterOn),
      afterOff: stateSnapshot(afterOff),
    });
  } catch (error) {
    return remember({ ...base, status: 'error', steps, error: errorMessage(error) });
  } finally {
    if (writeStarted) {
      const restoredInput = await sendInputEvent(client, event.hash, originalInputValue);
      const inputRestored = restoredInput.status === 'ok';
      if (!inputRestored) {
        steps.push({
          step: 'restore_input_value',
          value: originalInputValue,
          status: 'failed',
          error: restoredInput.error,
        });
        if (testResult) {
          testResult.restored = {
            inputValue: false,
            readback: false,
          };
          if (testResult.status === 'supported') testResult.status = 'restore_failed';
        }
      } else {
        await settle();
        const read = await waitForReadback(client, readback, initial);
        const readbackRestored = read.status === 'matched';
        steps.push(
          read.status === 'unavailable'
            ? {
                step: 'restore_readback',
                status: 'failed',
                attempts: read.attempts,
                elapsedMs: read.elapsedMs,
                error: read.error,
              }
            : {
                step: 'restore_readback',
                status: readbackRestored ? 'ok' : 'timeout',
                attempts: read.attempts,
                elapsedMs: read.elapsedMs,
                readback: read.state[readback],
              },
        );
        if (testResult) {
          testResult.restored = {
            inputValue: inputRestored,
            readback: readbackRestored,
          };
          if ((!inputRestored || !readbackRestored) && testResult.status === 'supported') {
            testResult.status = 'restore_failed';
          }
        }
      }
    }
  }
}

async function restoreCrossOperationState(
  client: MsfsCliClient,
  initialState: SimvarState,
): Promise<Record<string, unknown>> {
  const steps: Array<Record<string, unknown>> = [];
  const beforeResult = await readState(client);
  if (beforeResult.status !== 'ok') {
    return {
      status: 'failed',
      before: null,
      after: null,
      steps,
      reason: beforeResult.error.message,
    };
  }

  const initialAp = asBoolean(initialState, 'AUTOPILOT MASTER');
  const initialFd = asBoolean(initialState, 'AUTOPILOT FLIGHT DIRECTOR ACTIVE');
  if (initialAp === undefined || initialFd === undefined) {
    return {
      status: 'failed',
      before: stateSnapshot(beforeResult.state),
      after: stateSnapshot(beforeResult.state),
      steps,
      reason: '测试开始时无法确认 AP 或 FD 状态。',
    };
  }

  let current = beforeResult.state;
  let failed = false;

  const applyKeyEvent = async (
    event: string,
    readback: string,
    expected: boolean,
    step: string,
  ): Promise<boolean> => {
    const sent = await sendKeyEvent(client, event);
    if (sent.status !== 'ok') {
      failed = true;
      steps.push({ step, event, expected, status: 'failed', error: sent.error });
      return false;
    }
    await settle();
    const read = await waitForReadback(client, readback, expected);
    if (read.status === 'unavailable') {
      failed = true;
      steps.push({
        step,
        event,
        expected,
        status: 'readback_failed',
        attempts: read.attempts,
        elapsedMs: read.elapsedMs,
        error: read.error,
      });
      return false;
    }
    current = read.state;
    if (read.status !== 'matched') failed = true;
    steps.push({
      step,
      event,
      expected,
      status: read.status === 'matched' ? 'ok' : 'timeout',
      attempts: read.attempts,
      elapsedMs: read.elapsedMs,
      readback: read.state[readback],
    });
    return read.status === 'matched';
  };

  const restoreAp = async (expected: boolean): Promise<void> => {
    const currentAp = asBoolean(current, 'AUTOPILOT MASTER');
    if (currentAp === expected) return;
    await applyKeyEvent(
      expected ? 'AUTOPILOT_ON' : 'AUTOPILOT_OFF',
      'AUTOPILOT MASTER',
      expected,
      'restore_ap',
    );
  };

  const restoreFd = async (expected: boolean): Promise<void> => {
    const currentFd = asBoolean(current, 'AUTOPILOT FLIGHT DIRECTOR ACTIVE');
    if (currentFd === expected) return;

    // Some aircraft do not accept FD OFF while AP is engaged. Temporarily
    // disengage AP, toggle FD, then restore AP in the caller.
    if (asBoolean(current, 'AUTOPILOT MASTER') === true) {
      await restoreAp(false);
    }
    if (asBoolean(current, 'AUTOPILOT FLIGHT DIRECTOR ACTIVE') !== expected) {
      await applyKeyEvent(
        'TOGGLE_FLIGHT_DIRECTOR',
        'AUTOPILOT FLIGHT DIRECTOR ACTIVE',
        expected,
        'restore_fd',
      );
    }
  };

  // Restore FD before AP because AP can turn FD on as a side effect.
  if (initialAp === false) await restoreAp(false);
  await restoreFd(initialFd);
  await restoreAp(initialAp);

  const simpleModeRestores: Array<[string, string, string]> = [
    ['AUTOPILOT HEADING LOCK', 'AP_PANEL_HEADING_ON', 'AP_PANEL_HEADING_OFF'],
    ['AUTOPILOT NAV1 LOCK', 'AP_NAV1_HOLD_ON', 'AP_NAV1_HOLD_OFF'],
    ['AUTOPILOT ALTITUDE LOCK', 'AP_PANEL_ALTITUDE_ON', 'AP_PANEL_ALTITUDE_OFF'],
    ['AUTOPILOT VERTICAL HOLD', 'AP_PANEL_VS_ON', 'AP_PANEL_VS_OFF'],
    ['AUTOPILOT FLIGHT LEVEL CHANGE', 'FLIGHT_LEVEL_CHANGE_ON', 'FLIGHT_LEVEL_CHANGE_OFF'],
  ];
  for (const [readback, onEvent, offEvent] of simpleModeRestores) {
    const expected = asBoolean(initialState, readback);
    const currentValue = asBoolean(current, readback);
    if (expected === undefined) {
      failed = true;
      steps.push({ step: 'restore_mode', readback, status: 'unconfirmed' });
      continue;
    }
    if (currentValue !== expected) {
      await applyKeyEvent(expected ? onEvent : offEvent, readback, expected, `restore_${readback}`);
    }
  }

  // A mode event can have changed AP/FD as a side effect; reconcile the pair
  // once more before the final verification.
  await restoreFd(initialFd);
  await restoreAp(initialAp);

  let verifyResult = await readState(client);
  if (verifyResult.status === 'ok') current = verifyResult.state;
  if (asBoolean(current, 'AUTOPILOT FLIGHT DIRECTOR ACTIVE') !== initialFd && initialAp === true) {
    // Recovery cycle for aircraft that re-enable FD while AP is restored.
    steps.push({ step: 'restore_fd_recovery_cycle', status: 'started' });
    await restoreAp(false);
    await restoreFd(initialFd);
    await restoreAp(true);
    verifyResult = await readState(client);
    if (verifyResult.status === 'ok') current = verifyResult.state;
  }

  const finalResult = await readState(client);
  const after = finalResult.status === 'ok' ? finalResult.state : current;
  const expectedModes = [
    'AUTOPILOT MASTER',
    'AUTOPILOT FLIGHT DIRECTOR ACTIVE',
    ...simpleModeRestores.map(([readback]) => readback),
  ];
  const restored =
    !failed &&
    expectedModes.every(
      (readback) => asBoolean(after, readback) === asBoolean(initialState, readback),
    );
  if (finalResult.status !== 'ok') failed = true;

  return {
    status: restored && !failed ? 'restored' : 'failed',
    before: stateSnapshot(beforeResult.state),
    after: stateSnapshot(after),
    steps,
    ...(finalResult.status !== 'ok' ? { reason: finalResult.error.message } : {}),
  };
}

async function readAircraftIdentity(client: MsfsCliClient) {
  const [loadedPath, title, model, tailNumber, availability] = await Promise.all([
    readLoadedPath(client),
    readString(client, 'TITLE'),
    readString(client, 'ATC MODEL'),
    readString(client, 'ATC ID'),
    readAvailability(client),
  ]);
  return {
    loadedPath,
    title,
    model,
    tailNumber,
    autopilotAvailability: availability,
  };
}

async function loadCandidates(path: string): Promise<Candidate[]> {
  const parsed = candidateFileSchema.parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
  return parsed.candidates;
}

async function loadInputMap(path: string | undefined): Promise<Record<string, InputBinding>> {
  if (!path) return {};
  return inputMapSchema.parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

async function main(options: CliOptions) {
  const config = loadMsfsConfig();
  const executablePath = resolveMsfsCliPath({
    ...(config.cliPath ? { configuredPath: config.cliPath } : {}),
    developmentPath: resolve(projectRoot, 'dev-runtime', 'msfs-cli', 'msfs.exe'),
    resourcesPath: resolve(projectRoot, 'resources'),
    cwd: projectRoot,
  });
  const client = new MsfsCliClient({
    executablePath,
    timeoutMs: config.timeoutMs,
    maxConcurrency: 1,
    role: options.write ? 'ai' : 'monitor',
    onDiagnostic: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  });

  const candidates = await loadCandidates(options.candidatePath);
  const inputMap = await loadInputMap(options.inputMapPath);
  const identity = await readAircraftIdentity(client);
  if (identity.title.status !== 'ok')
    throw new Error(`无法读取当前飞机 TITLE：${identity.title.error.message}`);
  const currentTitle = identity.title.value.trim();
  if (options.expectedTitle && options.expectedTitle !== currentTitle) {
    throw new Error(
      `当前 TITLE 是“${currentTitle}”，与 --title 指定的“${options.expectedTitle}”不一致。`,
    );
  }
  const matchedCandidates = candidates.filter(
    (candidate) => candidate.aircraftTitle === currentTitle,
  );
  if (options.write && matchedCandidates.length === 0) {
    throw new Error(`当前飞机“${currentTitle}”不在候选清单中，已拒绝发送任何写入。`);
  }

  const candidateBindings: Record<string, InputBinding> = Object.assign(
    {},
    ...matchedCandidates.map((candidate) => candidate.inputEventBindings ?? {}),
    inputMap,
  );
  const requiredNames = new Set(Object.values(candidateBindings).map((binding) => binding.name));
  const inputInventory = shouldTestMethod(options.method, 'input_event')
    ? await inspectInputEvents(client, requiredNames)
    : null;
  const initialStateResult = await readState(client, true);
  const initialState = initialStateResult.status === 'ok' ? initialStateResult.state : null;

  const keyTests: Array<Record<string, unknown>> = [];
  const targetKeyTests: Array<Record<string, unknown>> = [];
  const inputTests: Array<Record<string, unknown>> = [];
  const targetRestoreEntries: TargetRestoreEntry[] = [];
  const targetRestoreKeys = new Set<string>();

  // Target writes must run before mode toggles. AP/ALT/VS/FLC mode events can
  // change an aircraft's internal target-slot state, even when their own
  // mode SimVars are later restored. Target tests restore their captured
  // value before the next target test starts.
  for (const operationId of options.targetOperations) {
    const definition = targetOperationDefinitions[operationId];
    const targetTest: Record<string, unknown> = shouldTestMethod(options.method, 'key_event')
      ? await testKeyTargetOperation(client, definition, options.write, options.allowGround)
      : {
          method: 'key_event',
          operation: definition.id,
          label: definition.label,
          status: 'not_run_method',
          reason: '本次 --method 没有请求 Key Event；目标值只在 Key Event 通道测试。',
        };
    targetKeyTests.push(targetTest);

    const restoreStatuses = new Set([
      'supported',
      'failed',
      'readback_timeout',
      'readback_mismatch',
      'restore_failed',
      'error',
    ]);
    const initialValue = targetTest.initialTargetValue;
    const slotIndex = targetTest.initialSlotIndex;
    if (
      options.write &&
      shouldTestMethod(options.method, 'key_event') &&
      restoreStatuses.has(String(targetTest.status)) &&
      typeof initialValue === 'number' &&
      Number.isFinite(initialValue) &&
      typeof slotIndex === 'number' &&
      isAutopilotTargetSlotIndexValid(definition.target, slotIndex)
    ) {
      const restoreKey = `${definition.id}:${slotIndex}`;
      if (!targetRestoreKeys.has(restoreKey)) {
        targetRestoreKeys.add(restoreKey);
        targetRestoreEntries.push({ definition, initialValue, slotIndex });
      }
    }
  }
  for (const operationId of options.operations) {
    const definition = operationDefinitions[operationId];
    if (shouldTestMethod(options.method, 'key_event')) {
      keyTests.push(await testKeyOperation(client, definition, options.write, options.allowGround));
    }
  }

  // Key Event writes may also update the corresponding Input Event value.
  // Refresh the inventory before testing the second channel so restoration
  // uses the current session value, not a stale value from the beginning.
  const inputInventoryForTests =
    shouldTestMethod(options.method, 'input_event') && shouldTestMethod(options.method, 'key_event')
      ? await inspectInputEvents(client, requiredNames)
      : inputInventory;
  if (shouldTestMethod(options.method, 'input_event')) {
    for (const operationId of options.operations) {
      const definition = operationDefinitions[operationId];
      const binding = candidateBindings[operationId];
      const event = binding ? inputEventInfo(inputInventoryForTests, binding.name) : null;
      inputTests.push(
        await testInputOperation(
          client,
          definition,
          binding,
          event,
          options.write,
          options.allowGround,
        ),
      );
    }
  }

  const globalStateRestoration =
    options.write && initialState
      ? await restoreCrossOperationState(client, initialState)
      : options.write
        ? {
            status: 'not_run',
            before: null,
            after: null,
            steps: [],
            reason: '测试开始时无法读取初始状态，因此没有发送写入。',
          }
        : null;

  // Mode restoration can itself change an aircraft's selected target. Restore
  // the target slots last, after all mode and Input Event tests are finished.
  const targetStateRestoration = options.write
    ? await restoreTargetValues(client, targetRestoreEntries)
    : null;

  const finalStateResult = await readState(client, true);
  const finalState = finalStateResult.status === 'ok' ? finalStateResult.state : null;
  const allTests = [...keyTests, ...targetKeyTests, ...inputTests];
  const supportedByMethod = (method: string) =>
    allTests.filter((test) => test.method === method && test.status === 'supported').length;
  const attemptedWrites = options.write
    ? allTests.filter((test) =>
        ['supported', 'failed', 'readback_timeout', 'readback_mismatch', 'error'].includes(
          String(test.status),
        ),
      ).length
    : 0;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'complete' as const,
    writeRequested: options.write,
    methodRequested: options.method,
    testOptions: {
      allowGround: options.allowGround,
      settleMs,
      readbackPollMs,
      readbackTimeoutMs,
    },
    operationsRequested: options.operations,
    targetOperationsRequested: options.targetOperations,
    writesAttempted: attemptedWrites > 0,
    sources: {
      candidateFile: options.candidatePath,
      inputMap: options.inputMapPath ?? null,
      executablePath,
    },
    aircraft: {
      title: currentTitle,
      model: identity.model.status === 'ok' ? identity.model.value : null,
      tailNumber: identity.tailNumber.status === 'ok' ? identity.tailNumber.value : null,
      loadedPath: identity.loadedPath.status === 'ok' ? identity.loadedPath.value : null,
      autopilotAvailable:
        identity.autopilotAvailability.status === 'ok'
          ? identity.autopilotAvailability.value
          : null,
    },
    candidateMatch: {
      matched: matchedCandidates.length > 0,
      records: matchedCandidates.map((candidate) => ({
        packageName: candidate.packageName,
        officialTitle: candidate.officialTitle,
        boundaryStatus: candidate.boundaryStatus,
        aircraftTitle: candidate.aircraftTitle,
      })),
    },
    inputEventInventory: inputInventory,
    inputEventInventoryAtInputTestStart:
      inputInventoryForTests === inputInventory ? null : inputInventoryForTests,
    initialState: stateSnapshot(initialState ?? undefined),
    initialStateOptionalErrors:
      initialStateResult.status === 'ok' ? initialStateResult.optionalErrors : [],
    tests: {
      key_event: keyTests,
      key_event_targets: targetKeyTests,
      input_event: inputTests,
    },
    finalState: stateSnapshot(finalState ?? undefined),
    finalStateOptionalErrors:
      finalStateResult.status === 'ok' ? finalStateResult.optionalErrors : [],
    globalStateRestoration,
    targetStateRestoration,
    summary: {
      candidateMatched: matchedCandidates.length > 0,
      keyEventSupportedCount: supportedByMethod('key_event'),
      inputEventSupportedCount: supportedByMethod('input_event'),
      operationCount: options.operations.length,
      targetOperationCount: options.targetOperations.length,
      targetKeyEventSupportedCount: targetKeyTests.filter((test) => test.status === 'supported')
        .length,
      writesAttempted: attemptedWrites,
      globalStateRestored:
        globalStateRestoration?.status === 'restored' &&
        (targetStateRestoration === null || targetStateRestoration.status === 'restored'),
      whitelistPromotionAllowed: false,
      whitelistPromotionReason:
        '测试结果需要人工审阅，并确认当前用户飞机身份、写入方式、操作范围和恢复结果后，才能写入正式白名单。',
    },
  };
}

const rawArgs = process.argv.slice(2);
const parsed = parseArgs(rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs);
if ('help' in parsed) {
  usage();
} else {
  try {
    const output = await main(parsed);
    await mkdir(dirname(parsed.outputPath), { recursive: true });
    await writeFile(parsed.outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `${JSON.stringify(
        {
          outputPath: parsed.outputPath,
          aircraftTitle: output.aircraft.title,
          candidateMatched: output.candidateMatch.matched,
          writeRequested: output.writeRequested,
          keyEventSupportedCount: output.summary.keyEventSupportedCount,
          inputEventSupportedCount: output.summary.inputEventSupportedCount,
        },
        null,
        2,
      )}\n`,
    );
    if (parsed.write && !output.candidateMatch.matched) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`自动驾驶写入测试未完成：${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
