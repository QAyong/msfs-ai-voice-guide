import { createHash } from 'node:crypto';
import { z } from 'zod';
import { MsfsCliClient } from './cli-client.js';
import {
  aircraftListDataSchema,
  inputEventListDataSchema,
  inputEventParamsDataSchema,
  inputEventValueDataSchema,
  simvarItemSchema,
  stringSimvarDataSchema,
  systemStateDataSchema,
} from './schemas.js';
import type { MsfsUnavailableCode } from './types.js';

const inspectionValueSuccessSchema = z.object({
  status: z.literal('ok'),
  value: z.union([z.number().finite(), z.string(), z.boolean()]),
});

const inspectionValueFailureSchema = z.object({
  status: z.literal('unavailable'),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const inspectionValueSchema = z.discriminatedUnion('status', [
  inspectionValueSuccessSchema,
  inspectionValueFailureSchema,
]);
export type InspectionValue = z.infer<typeof inspectionValueSchema>;

export const inspectionSimvarSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  datatype: z.enum(['FLOAT64', 'STRING256']),
  result: inspectionValueSchema,
});
export type InspectionSimvar = z.infer<typeof inspectionSimvarSchema>;

export const inspectionInputEventSchema = z.object({
  name: z.string().min(1),
  hash: z.string().regex(/^\d+$/),
  type: z.number().int(),
  relevant: z.boolean(),
  params: inspectionValueSchema.optional(),
  value: inspectionValueSchema.optional(),
});
export type InspectionInputEvent = z.infer<typeof inspectionInputEventSchema>;

export const aircraftInspectionSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.string().datetime(),
  source: z.literal('native_simconnect'),
  readOnly: z.literal(true),
  writesAttempted: z.literal(false),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  collection: z.object({
    status: z.enum(['complete', 'partial', 'unavailable']),
    successfulProbeCount: z.number().int().nonnegative(),
    failedProbeCount: z.number().int().nonnegative(),
  }),
  aircraft: z.object({
    loaded: inspectionValueSchema,
    loadedPath: inspectionValueSchema,
    title: inspectionValueSchema,
    model: inspectionValueSchema,
    type: inspectionValueSchema,
    tailNumber: inspectionValueSchema,
  }),
  autopilot: z.object({
    availability: z.enum(['supported', 'unsupported', 'unknown']),
    availabilityObservation: inspectionSimvarSchema,
    simvars: z.array(inspectionSimvarSchema),
    inputEvents: z.object({
      status: z.enum(['ok', 'unavailable']),
      events: z.array(inspectionInputEventSchema),
      error: inspectionValueFailureSchema.optional(),
    }),
  }),
  spawnableAircraft: z.object({
    status: z.enum(['ok', 'unavailable']),
    type: z.string().min(1),
    uniqueTitleCount: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        aircraft_title: z.string(),
        livery_name: z.string(),
      }),
    ),
    error: inspectionValueFailureSchema.optional(),
  }),
  warnings: z.array(z.string()),
});
export type AircraftInspection = z.infer<typeof aircraftInspectionSchema>;

export const aircraftIdentitySimvars = [
  { key: 'title', name: 'TITLE', unit: 'string', datatype: 'string' },
  { key: 'model', name: 'ATC MODEL', unit: 'string', datatype: 'string' },
  { key: 'type', name: 'ATC TYPE', unit: 'string', datatype: 'string' },
  { key: 'tailNumber', name: 'ATC ID', unit: 'string', datatype: 'string' },
] as const;

export const autopilotInspectionSimvars = [
  { name: 'AUTOPILOT AVAILABLE', unit: 'bool' },
  { name: 'AUTOPILOT MASTER', unit: 'bool' },
  { name: 'AUTOPILOT FLIGHT DIRECTOR ACTIVE', unit: 'bool' },
  { name: 'AUTOPILOT DEFAULT ROLL MODE', unit: 'number' },
  { name: 'AUTOPILOT DEFAULT PITCH MODE', unit: 'number' },
  { name: 'AUTOPILOT HEADING MANUALLY TUNABLE', unit: 'bool' },
  { name: 'AUTOPILOT HEADING LOCK', unit: 'bool' },
  { name: 'AUTOPILOT HEADING LOCK DIR', unit: 'degrees' },
  { name: 'AUTOPILOT HEADING SLOT INDEX', unit: 'number' },
  { name: 'NAV AVAILABLE:1', unit: 'bool' },
  { name: 'AUTOPILOT NAV1 LOCK', unit: 'bool' },
  { name: 'AUTOPILOT ALTITUDE MANUALLY TUNABLE', unit: 'bool' },
  { name: 'AUTOPILOT ALTITUDE ARM', unit: 'bool' },
  { name: 'AUTOPILOT ALTITUDE LOCK', unit: 'bool' },
  { name: 'AUTOPILOT ALTITUDE LOCK VAR', unit: 'feet' },
  { name: 'AUTOPILOT ALTITUDE SLOT INDEX', unit: 'number' },
  { name: 'AUTOPILOT VERTICAL HOLD', unit: 'bool' },
  { name: 'AUTOPILOT VERTICAL HOLD VAR', unit: 'feet per minute' },
  { name: 'AUTOPILOT VS SLOT INDEX', unit: 'number' },
  { name: 'AUTOPILOT FLIGHT LEVEL CHANGE', unit: 'bool' },
  { name: 'AUTOPILOT AIRSPEED HOLD', unit: 'bool' },
  { name: 'AUTOPILOT AIRSPEED HOLD VAR', unit: 'knots' },
  { name: 'AUTOPILOT SPEED SLOT INDEX', unit: 'number' },
] as const;

const autopilotInputEventPattern =
  /(AUTOPILOT|FLIGHT[_ ]DIRECTOR|HEADING|ALTITUDE|VERTICAL|FLIGHT[_ ]LEVEL|NAV|FLC)/iu;

export type AircraftInspectorOptions = {
  maxInputEventDetails?: number;
  signal?: AbortSignal;
};

type ProbeResult = {
  result: InspectionValue;
  succeeded: boolean;
};

const failure = (code: MsfsUnavailableCode | string, message: string): InspectionValue => ({
  status: 'unavailable',
  code,
  message,
});

const fromUnavailable = (result: { code: string; message: string }): ProbeResult => ({
  result: failure(result.code, result.message),
  succeeded: false,
});

const fromNumberResult = (result: Awaited<ReturnType<MsfsCliClient['execute']>>): ProbeResult => {
  if (result.status !== 'ok') return fromUnavailable(result);
  const parsed = simvarItemSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      result: failure('MSFS_CLI_PROTOCOL_ERROR', 'MSFS CLI 返回的 SimVar 数据格式无效。'),
      succeeded: false,
    };
  }
  return { result: { status: 'ok', value: parsed.data.value }, succeeded: true };
};

async function readNumber(
  client: MsfsCliClient,
  name: string,
  unit: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  return fromNumberResult(
    await client.execute(
      ['simvar', 'get', '--name', name, '--unit', unit],
      simvarItemSchema,
      signal,
    ),
  );
}

async function readString(
  client: MsfsCliClient,
  name: string,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const result = await client.execute(
    ['simvar', 'get', '--name', name, '--unit', 'string', '--datatype', 'string'],
    stringSimvarDataSchema,
    signal,
  );
  if (result.status !== 'ok') return fromUnavailable(result);
  return { result: { status: 'ok', value: result.data.value }, succeeded: true };
}

const simvarRecord = (
  name: string,
  unit: string,
  datatype: 'FLOAT64' | 'STRING256',
  result: InspectionValue,
): InspectionSimvar => ({ name, unit, datatype, result });

const autopilotAvailability = (
  result: InspectionValue,
): AircraftInspection['autopilot']['availability'] =>
  result.status !== 'ok' ||
  typeof result.value !== 'number' ||
  (result.value !== 0 && result.value !== 1)
    ? 'unknown'
    : result.value === 1
      ? 'supported'
      : 'unsupported';

const isRelevantInputEvent = (name: string): boolean => autopilotInputEventPattern.test(name);

const inputEventFailure = (result: { code: string; message: string }): InspectionValue =>
  failure(result.code, result.message);

async function enrichInputEvent(
  client: MsfsCliClient,
  event: z.infer<typeof inputEventListDataSchema>['events'][number],
  signal?: AbortSignal,
): Promise<{ inspection: InspectionInputEvent; failedProbeCount: number }> {
  const relevant = isRelevantInputEvent(event.name);
  if (!relevant) {
    return {
      inspection: { ...event, relevant },
      failedProbeCount: 0,
    };
  }

  const params = await client.execute(
    ['input', 'params', '--hash', event.hash],
    inputEventParamsDataSchema,
    signal,
  );
  const value = await client.execute(
    ['input', 'get', '--hash', event.hash],
    inputEventValueDataSchema,
    signal,
  );
  const paramsResult: InspectionValue =
    params.status === 'ok'
      ? { status: 'ok', value: params.data.params }
      : inputEventFailure(params);
  const valueResult: InspectionValue =
    value.status === 'ok' ? { status: 'ok', value: value.data.value } : inputEventFailure(value);
  return {
    inspection: { ...event, relevant, params: paramsResult, value: valueResult },
    failedProbeCount: (params.status === 'ok' ? 0 : 1) + (value.status === 'ok' ? 0 : 1),
  };
}

const fingerprintFor = (
  identity: Record<string, InspectionValue>,
  inputEvents: readonly InspectionInputEvent[],
): string => {
  const hashInput = {
    identity: Object.fromEntries(
      Object.entries(identity).map(([key, value]) => [
        key,
        value.status === 'ok' ? value.value : null,
      ]),
    ),
    inputEvents: inputEvents.map(({ name, hash, type }) => ({ name, hash, type })),
  };
  return createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
};

export async function inspectCurrentAircraft(
  client: MsfsCliClient,
  options: AircraftInspectorOptions = {},
): Promise<AircraftInspection> {
  const signal = options.signal;
  const warnings: string[] = [];
  let successfulProbeCount = 0;
  let failedProbeCount = 0;
  const countProbe = (probe: ProbeResult): InspectionValue => {
    if (probe.succeeded) successfulProbeCount += 1;
    else failedProbeCount += 1;
    return probe.result;
  };

  const loadedPathProbe = countProbe(
    await client
      .execute(['system', 'state', '--name', 'AircraftLoaded'], systemStateDataSchema, signal)
      .then((result): ProbeResult => {
        if (result.status !== 'ok') return fromUnavailable(result);
        return {
          result: { status: 'ok', value: result.data.value.string },
          succeeded: true,
        };
      }),
  );
  const loadedProbe: InspectionValue =
    loadedPathProbe.status === 'ok' && typeof loadedPathProbe.value === 'string'
      ? { status: 'ok', value: loadedPathProbe.value.trim().length > 0 }
      : loadedPathProbe;
  if (loadedProbe.status === 'ok' && loadedProbe.value === false) {
    warnings.push('AircraftLoaded 未返回飞机路径；当前未确认已有飞机加载。');
  }

  const identity: Record<string, InspectionValue> = {};
  for (const item of aircraftIdentitySimvars) {
    identity[item.key] = countProbe(await readString(client, item.name, signal));
  }

  const simvars: InspectionSimvar[] = [];
  for (const item of autopilotInspectionSimvars) {
    const probe = await readNumber(client, item.name, item.unit, signal);
    const result = countProbe(probe);
    simvars.push(simvarRecord(item.name, item.unit, 'FLOAT64', result));
  }

  const availabilityObservation = simvars[0];
  if (!availabilityObservation) {
    throw new Error('Automatic pilot inspection definition is empty.');
  }
  const availability = autopilotAvailability(availabilityObservation.result);
  if (availability === 'unknown') {
    warnings.push('AUTOPILOT AVAILABLE 未能读取为明确的 0/1；本机自动驾驶能力保持 unknown。');
  }

  const aircraftListResult = await client.execute(
    ['aircraft', 'list', '--type', 'aircraft'],
    aircraftListDataSchema,
    signal,
  );
  const spawnableAircraft =
    aircraftListResult.status === 'ok'
      ? {
          status: 'ok' as const,
          type: aircraftListResult.data.type,
          uniqueTitleCount: new Set(
            aircraftListResult.data.items
              .map((item) => item.aircraft_title.trim())
              .filter((title) => title.length > 0),
          ).size,
          items: aircraftListResult.data.items,
        }
      : {
          status: 'unavailable' as const,
          type: 'aircraft',
          uniqueTitleCount: 0,
          items: [],
          error: {
            status: 'unavailable' as const,
            code: aircraftListResult.code,
            message: aircraftListResult.message,
          },
        };
  if (aircraftListResult.status === 'ok') {
    successfulProbeCount += 1;
  } else {
    failedProbeCount += 1;
    warnings.push('当前模拟器的可生成飞机目录无法读取。');
  }

  const inputEventsResult = await client.execute(
    ['input', 'list'],
    inputEventListDataSchema,
    signal,
  );
  let inputEvents: InspectionInputEvent[] = [];
  let inputEventError: z.infer<typeof inspectionValueFailureSchema> | undefined;
  if (inputEventsResult.status !== 'ok') {
    failedProbeCount += 1;
    inputEventError = {
      status: 'unavailable',
      code: inputEventsResult.code,
      message: inputEventsResult.message,
    };
    warnings.push('当前飞机的 Input Event 列表无法读取。');
  } else {
    successfulProbeCount += 1;
    const maxDetails = Math.max(0, options.maxInputEventDetails ?? 128);
    const relevantEvents = inputEventsResult.data.events.filter((event) =>
      isRelevantInputEvent(event.name),
    );
    const detailEvents = new Set(relevantEvents.slice(0, maxDetails).map((event) => event.hash));
    if (relevantEvents.length > maxDetails) {
      warnings.push(
        `相关 Input Event 共 ${relevantEvents.length} 个，仅展开前 ${maxDetails} 个的参数和值。`,
      );
    }
    const enriched: InspectionInputEvent[] = [];
    for (const event of inputEventsResult.data.events) {
      if (!detailEvents.has(event.hash)) {
        enriched.push({ ...event, relevant: isRelevantInputEvent(event.name) });
        continue;
      }
      const result = await enrichInputEvent(client, event, signal);
      enriched.push(result.inspection);
      failedProbeCount += result.failedProbeCount;
      successfulProbeCount += 2 - result.failedProbeCount;
    }
    inputEvents = enriched;
  }

  const identityResults = Object.fromEntries(
    aircraftIdentitySimvars.map((item) => [
      item.key,
      identity[item.key] ?? failure('MSFS_CLI_PROTOCOL_ERROR', '身份字段未生成。'),
    ]),
  );
  const status =
    successfulProbeCount === 0 ? 'unavailable' : failedProbeCount === 0 ? 'complete' : 'partial';
  if (failedProbeCount > 0 && status === 'partial') {
    warnings.push(`本次采集有 ${failedProbeCount} 个只读探针失败，失败字段保留为 unavailable。`);
  }

  const fingerprint = fingerprintFor(identityResults, inputEvents);
  const inspection = {
    schemaVersion: 1 as const,
    collectedAt: new Date().toISOString(),
    source: 'native_simconnect' as const,
    readOnly: true as const,
    writesAttempted: false as const,
    fingerprint,
    collection: { status, successfulProbeCount, failedProbeCount },
    aircraft: {
      loaded: loadedProbe,
      loadedPath: loadedPathProbe,
      title: identityResults.title,
      model: identityResults.model,
      type: identityResults.type,
      tailNumber: identityResults.tailNumber,
    },
    autopilot: {
      availability,
      availabilityObservation,
      simvars,
      inputEvents: {
        status: inputEventsResult.status === 'ok' ? ('ok' as const) : ('unavailable' as const),
        events: inputEvents,
        ...(inputEventError ? { error: inputEventError } : {}),
      },
    },
    spawnableAircraft,
    warnings,
  };

  return aircraftInspectionSchema.parse(inspection);
}
