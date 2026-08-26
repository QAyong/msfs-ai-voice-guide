import { z } from 'zod';
import { MsfsCliClient } from './cli-client.js';
import {
  facilitiesDataSchema,
  geoContextDataSchema,
  autopilotAvailabilityDataSchema,
  inputEventListDataSchema,
  inputEventSetDataSchema,
  keyEventDataSchema,
  routeDataSchema,
  routeLegSchema,
  routeSchema,
  simvarBatchDataSchema,
  simvarItemSchema,
  statusDataSchema,
  stringSimvarDataSchema,
  systemStateDataSchema,
  trackPointSchema,
} from './schemas.js';
import { MsfsTrackCache } from './track-cache.js';
import {
  msfsUnavailableCodeSchema,
  msfsReadinessSchema,
  msfsUnavailableSchema,
  type MsfsCommandResult,
  type MsfsReadiness,
} from './types.js';
import type { ProcessWatchHandle } from './process-runner.js';

const sourceSchema = z.literal('native_simconnect');
const timestampSchema = z.string().datetime();

export const gamePoiSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(240).optional(),
  distanceKm: z.number().finite().nonnegative().optional(),
  providerSource: z.string().trim().min(1).max(160).optional(),
});
export type GamePoi = z.infer<typeof gamePoiSchema>;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const optionalText = (value: unknown, maximum: number) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, maximum);
};

const optionalDistanceKm = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
};

/**
 * Normalizes the Geo Cloud game_poi payload without changing the raw context.
 * The provider currently returns { game_poi: { nearby: [...] } }.
 */
export const normalizeGamePois = (context: Record<string, unknown>): GamePoi[] => {
  const gamePoi = record(context.game_poi);
  const nearby = Array.isArray(gamePoi?.nearby) ? gamePoi.nearby : [];
  const candidates = nearby.flatMap((value) => {
    const item = record(value);
    const name = optionalText(item?.name, 160);
    if (!name) return [];
    const parsed = gamePoiSchema.safeParse({
      name,
      ...(optionalText(item?.type, 80) ? { type: optionalText(item?.type, 80) } : {}),
      ...(optionalText(item?.description, 240)
        ? { description: optionalText(item?.description, 240) }
        : {}),
      ...(optionalDistanceKm(item?.dist_km) !== undefined
        ? { distanceKm: optionalDistanceKm(item?.dist_km) }
        : {}),
      ...(optionalText(item?.source, 160)
        ? { providerSource: optionalText(item?.source, 160) }
        : {}),
    });
    return parsed.success ? [parsed.data] : [];
  });

  const sorted = [...candidates].sort(
    (first, second) =>
      (first.distanceKm ?? Number.POSITIVE_INFINITY) -
      (second.distanceKm ?? Number.POSITIVE_INFINITY),
  );
  const seen = new Set<string>();
  return sorted
    .filter((poi) => {
      const key = poi.name.normalize('NFKC').trim().toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
};

export const flightSnapshotSchema = z.object({
  status: z.literal('ok'),
  source: sourceSchema,
  timestamp: timestampSchema,
  position: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    altitudeFeet: z.number().finite(),
    groundAltitudeFeet: z.number().finite(),
  }),
  motion: z.object({
    groundSpeedKnots: z.number().finite(),
    indicatedAirspeedKnots: z.number().finite(),
    verticalSpeedFeetPerMinute: z.number().finite(),
    headingTrueDegrees: z.number().finite(),
  }),
  attitude: z.object({
    pitchDegrees: z.number().finite(),
    bankDegrees: z.number().finite(),
  }),
  onGround: z.boolean(),
  aircraft: z.object({
    title: z.string().optional(),
    tailNumber: z.string().optional(),
  }),
});

export const flightSnapshotResultSchema = z.union([flightSnapshotSchema, msfsUnavailableSchema]);
export type FlightSnapshotResult = z.infer<typeof flightSnapshotResultSchema>;

export const locationContextSchema = z.object({
  status: z.literal('ok'),
  source: z.literal('external_geo_cloud'),
  timestamp: timestampSchema,
  context: z.record(z.string(), z.unknown()),
  gamePois: z.array(gamePoiSchema).max(5).optional(),
});
export const locationContextResultSchema = z.union([locationContextSchema, msfsUnavailableSchema]);
export type LocationContextResult = z.infer<typeof locationContextResultSchema>;

export const routeBriefSchema = z.object({
  status: z.literal('ok'),
  source: z.literal('native_efb'),
  timestamp: timestampSchema,
  route: routeSchema,
});
export const routeBriefResultSchema = z.union([routeBriefSchema, msfsUnavailableSchema]);
export type RouteBriefResult = z.infer<typeof routeBriefResultSchema>;

export const nextWaypointSchema = z.object({
  status: z.literal('ok'),
  source: z.literal('native_efb'),
  timestamp: timestampSchema,
  gpsNextId: z.string(),
  nextWaypoint: routeLegSchema.nullable(),
  route: z.object({
    departureIcao: z.string(),
    destinationIcao: z.string(),
    totalEnrouteLegs: z.number().int().nonnegative(),
  }),
});
export const nextWaypointResultSchema = z.union([nextWaypointSchema, msfsUnavailableSchema]);
export type NextWaypointResult = z.infer<typeof nextWaypointResultSchema>;

export const nearbyFacilitiesSchema = z.object({
  status: z.literal('ok'),
  source: z.literal('native_simconnect_facilities'),
  timestamp: timestampSchema,
  type: z.enum(['airport', 'waypoint', 'ndb', 'vor']),
  radiusNm: z.number().positive(),
  facilities: facilitiesDataSchema.shape.facilities,
});
export const nearbyFacilitiesResultSchema = z.union([
  nearbyFacilitiesSchema,
  msfsUnavailableSchema,
]);
export type NearbyFacilitiesResult = z.infer<typeof nearbyFacilitiesResultSchema>;

export const weatherAndSimTimeSchema = z.object({
  status: z.literal('ok'),
  source: sourceSchema,
  timestamp: timestampSchema,
  scope: z.literal('simulator_environment'),
  weather: z.object({
    temperatureCelsius: z.number().finite(),
    windSpeedKnots: z.number().finite(),
    windDirectionDegrees: z.number().finite(),
    pressureInHg: z.number().finite(),
    visibilityMeters: z.number().finite(),
  }),
  simulatorTime: z.object({
    zuluSecondsSinceMidnight: z.number().finite(),
    localSecondsSinceMidnight: z.number().finite(),
    zuluYear: z.number().int(),
    zuluMonth: z.number().int(),
    zuluDay: z.number().int(),
  }),
});
export const weatherAndSimTimeResultSchema = z.union([
  weatherAndSimTimeSchema,
  msfsUnavailableSchema,
]);
export type WeatherAndSimTimeResult = z.infer<typeof weatherAndSimTimeResultSchema>;

export const trackHistorySchema = z.object({
  status: z.literal('ok'),
  source: sourceSchema,
  timestamp: timestampSchema,
  scope: z.literal('current_agent_session'),
  points: z.array(trackPointSchema),
});
export const trackHistoryResultSchema = z.union([trackHistorySchema, msfsUnavailableSchema]);
export type TrackHistoryResult = z.infer<typeof trackHistoryResultSchema>;

export const autopilotAvailabilitySchema = z.object({
  status: z.enum(['supported', 'unsupported', 'unknown']),
  source: sourceSchema,
  timestamp: timestampSchema,
  available: z.boolean().optional(),
  code: msfsUnavailableCodeSchema.optional(),
  message: z.string().min(1),
});
export type AutopilotAvailabilityResult = z.infer<typeof autopilotAvailabilitySchema>;

const autopilotCapabilityStatusSchema = z.enum(['supported', 'unsupported', 'unknown']);

export const autopilotModeSchema = z.enum(['HDG', 'NAV', 'ALT', 'VS', 'FLC']);

export const setAutopilotInputSchema = z
  .object({
    ap: z.boolean().optional().describe('是否打开或关闭自动驾驶总开关。'),
    fd: z.boolean().optional().describe('是否打开或关闭飞行指引。'),
    lateralMode: z
      .enum(['HDG', 'NAV'])
      .optional()
      .describe('横向模式：HDG 航向保持或 NAV 导航跟踪。'),
    verticalMode: z
      .enum(['ALT', 'VS', 'FLC'])
      .optional()
      .describe('纵向模式：ALT 高度、VS 垂直速度或 FLC 高度层改变。'),
    targetAltitudeFeet: z
      .number()
      .finite()
      .min(0)
      .max(100_000)
      .optional()
      .describe('目标高度，单位英尺。'),
    targetHeadingDegrees: z
      .number()
      .finite()
      .min(0)
      .max(360)
      .optional()
      .describe('目标航向，单位度。'),
    targetSpeedKnots: z
      .number()
      .finite()
      .min(0)
      .max(1_000)
      .optional()
      .describe('目标速度，单位节。'),
    targetVerticalSpeedFpm: z
      .number()
      .finite()
      .min(-20_000)
      .max(20_000)
      .optional()
      .describe('目标垂直速度，单位英尺/分钟，可为负数。'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少需要提供一个自动驾驶设置。',
  });
export type SetAutopilotInput = z.infer<typeof setAutopilotInputSchema>;

const autopilotCapabilitiesSchema = z.object({
  autopilot: autopilotCapabilityStatusSchema,
  flightDirector: autopilotCapabilityStatusSchema,
  heading: autopilotCapabilityStatusSchema,
  navigation: autopilotCapabilityStatusSchema,
  altitude: autopilotCapabilityStatusSchema,
  verticalSpeed: autopilotCapabilityStatusSchema,
  flightLevelChange: autopilotCapabilityStatusSchema,
});

export const autopilotStateSchema = z.object({
  status: z.literal('ok'),
  source: sourceSchema,
  timestamp: timestampSchema,
  capabilities: autopilotCapabilitiesSchema,
  active: z.object({
    autopilot: z.boolean(),
    flightDirector: z.boolean(),
    heading: z.boolean(),
    navigation: z.boolean(),
    altitude: z.boolean(),
    verticalSpeed: z.boolean(),
    flightLevelChange: z.boolean(),
    airspeed: z.boolean(),
  }),
  armed: z.object({
    altitude: z.boolean(),
  }),
  targets: z.object({
    altitudeFeet: z.number().finite(),
    headingDegrees: z.number().finite(),
    speedKnots: z.number().finite(),
    verticalSpeedFpm: z.number().finite(),
  }),
});
export const autopilotStateResultSchema = z.union([autopilotStateSchema, msfsUnavailableSchema]);
export type AutopilotStateResult = z.infer<typeof autopilotStateResultSchema>;
export type AutopilotState = z.infer<typeof autopilotStateSchema>;
type AutopilotCapability = keyof AutopilotState['capabilities'];

const autopilotCapabilityLabels: Record<AutopilotCapability, string> = {
  autopilot: '自动驾驶',
  flightDirector: '飞行指引',
  heading: 'HDG 航向模式',
  navigation: 'NAV 导航模式',
  altitude: 'ALT 高度保持',
  verticalSpeed: 'VS 垂直速度模式',
  flightLevelChange: 'FLC 高度层改变',
};

const stateWithUnsupportedCapabilities = (
  state: AutopilotState,
  capabilities: Iterable<AutopilotCapability>,
): AutopilotState =>
  autopilotStateSchema.parse({
    ...state,
    capabilities: {
      ...state.capabilities,
      ...Object.fromEntries(
        [...new Set(capabilities)].map((capability) => [capability, 'unsupported']),
      ),
    },
  });

const autopilotActionStepSchema = z.object({
  operation: z.string().min(1),
  status: z.enum(['sent', 'skipped', 'failed']),
});
export type AutopilotActionStep = z.infer<typeof autopilotActionStepSchema>;

const autopilotActionResponseSchema = z.object({
  status: z.enum(['ok', 'rejected', 'partial']),
  source: sourceSchema,
  timestamp: timestampSchema,
  message: z.string().min(1),
  requested: setAutopilotInputSchema,
  steps: z.array(autopilotActionStepSchema),
  state: autopilotStateSchema.optional(),
});
export const autopilotActionResultSchema = z.union([
  autopilotActionResponseSchema,
  msfsUnavailableSchema,
]);
export type AutopilotActionResult = z.infer<typeof autopilotActionResultSchema>;

const flightItems = [
  ['PLANE LATITUDE', 'degrees'],
  ['PLANE LONGITUDE', 'degrees'],
  ['PLANE ALTITUDE', 'feet'],
  ['GROUND ALTITUDE', 'feet'],
  ['GROUND VELOCITY', 'knots'],
  ['AIRSPEED INDICATED', 'knots'],
  ['VERTICAL SPEED', 'feet per minute'],
  ['PLANE PITCH DEGREES', 'degrees'],
  ['PLANE BANK DEGREES', 'degrees'],
  ['PLANE HEADING DEGREES TRUE', 'degrees'],
  ['SIM ON GROUND', 'bool'],
] as const;

const weatherItems = [
  ['AMBIENT TEMPERATURE', 'celsius'],
  ['AMBIENT WIND VELOCITY', 'knots'],
  ['AMBIENT WIND DIRECTION', 'degrees'],
  ['AMBIENT PRESSURE', 'inHg'],
  ['AMBIENT VISIBILITY', 'meters'],
  ['ZULU TIME', 'seconds'],
  ['LOCAL TIME', 'seconds'],
  ['ZULU YEAR', 'number'],
  ['ZULU MONTH OF YEAR', 'number'],
  ['ZULU DAY OF MONTH', 'number'],
] as const;

const itemArgument = (items: readonly (readonly [string, string])[]) =>
  items.map(([name, unit]) => `${name}|${unit}`).join(';');

const byName = (items: Array<z.infer<typeof simvarItemSchema>>) =>
  new Map(items.map((item) => [item.name, item.value]));

const requiredValue = (values: Map<string, number>, name: string): number => {
  const value = values.get(name);
  if (value === undefined) throw new Error(`Missing normalized SimVar: ${name}`);
  return value;
};

const booleanValue = (values: Map<string, number>, name: string): boolean => {
  const value = requiredValue(values, name);
  if (value !== 0 && value !== 1) throw new Error(`Invalid boolean SimVar: ${name}`);
  return value === 1;
};

const capabilityFromEvidence = (
  autopilotAvailable: boolean,
  evidence: boolean,
): z.infer<typeof autopilotCapabilityStatusSchema> => {
  if (!autopilotAvailable) return 'unsupported';
  return evidence ? 'supported' : 'unknown';
};

const normalizeHeading = (value: number): number => {
  const normalized = value % 360;
  return normalized === 360 || normalized === 0
    ? 0
    : normalized < 0
      ? normalized + 360
      : normalized;
};

const eventInteger = (value: number): number => Math.trunc(value) >>> 0;

const circularHeadingDifference = (first: number, second: number): number => {
  const difference = Math.abs(normalizeHeading(first) - normalizeHeading(second));
  return Math.min(difference, 360 - difference);
};

const autopilotItems = [
  ['AUTOPILOT AVAILABLE', 'bool'],
  ['AUTOPILOT MASTER', 'bool'],
  ['AUTOPILOT FLIGHT DIRECTOR ACTIVE', 'bool'],
  ['AUTOPILOT DEFAULT ROLL MODE', 'number'],
  ['AUTOPILOT DEFAULT PITCH MODE', 'number'],
  ['AUTOPILOT HEADING MANUALLY TUNABLE', 'bool'],
  ['AUTOPILOT HEADING LOCK', 'bool'],
  ['AUTOPILOT HEADING LOCK DIR', 'degrees'],
  ['NAV AVAILABLE:1', 'bool'],
  ['AUTOPILOT NAV1 LOCK', 'bool'],
  ['AUTOPILOT ALTITUDE MANUALLY TUNABLE', 'bool'],
  ['AUTOPILOT ALTITUDE ARM', 'bool'],
  ['AUTOPILOT ALTITUDE LOCK', 'bool'],
  ['AUTOPILOT ALTITUDE LOCK VAR', 'feet'],
  ['AUTOPILOT VERTICAL HOLD', 'bool'],
  ['AUTOPILOT VERTICAL HOLD VAR', 'feet per minute'],
  ['AUTOPILOT FLIGHT LEVEL CHANGE', 'bool'],
  ['AUTOPILOT AIRSPEED HOLD', 'bool'],
  ['AUTOPILOT AIRSPEED HOLD VAR', 'knots'],
] as const;

const createAutopilotState = (values: Map<string, number>) => {
  const autopilotAvailable = booleanValue(values, 'AUTOPILOT AVAILABLE');
  const active = {
    autopilot: booleanValue(values, 'AUTOPILOT MASTER'),
    flightDirector: booleanValue(values, 'AUTOPILOT FLIGHT DIRECTOR ACTIVE'),
    heading: booleanValue(values, 'AUTOPILOT HEADING LOCK'),
    navigation: booleanValue(values, 'AUTOPILOT NAV1 LOCK'),
    altitude: booleanValue(values, 'AUTOPILOT ALTITUDE LOCK'),
    verticalSpeed: booleanValue(values, 'AUTOPILOT VERTICAL HOLD'),
    flightLevelChange: booleanValue(values, 'AUTOPILOT FLIGHT LEVEL CHANGE'),
    airspeed: booleanValue(values, 'AUTOPILOT AIRSPEED HOLD'),
  };
  const defaultRollMode = Math.trunc(requiredValue(values, 'AUTOPILOT DEFAULT ROLL MODE'));
  const defaultPitchMode = Math.trunc(requiredValue(values, 'AUTOPILOT DEFAULT PITCH MODE'));
  const headingEvidence =
    active.heading ||
    booleanValue(values, 'AUTOPILOT HEADING MANUALLY TUNABLE') ||
    defaultRollMode === 2;
  const altitudeEvidence =
    active.altitude ||
    booleanValue(values, 'AUTOPILOT ALTITUDE ARM') ||
    booleanValue(values, 'AUTOPILOT ALTITUDE MANUALLY TUNABLE') ||
    defaultPitchMode === 2;
  // The official enum uses 0 for "None" and 1/2/3 for an available pitch
  // controller mode. It does not expose a separate VS-capability flag; use a
  // non-zero pitch mode as the preflight evidence and verify VS after the event.
  const verticalSpeedEvidence = active.verticalSpeed || defaultPitchMode !== 0;
  const navigationAvailable = booleanValue(values, 'NAV AVAILABLE:1');

  return autopilotStateSchema.parse({
    status: 'ok',
    source: 'native_simconnect',
    timestamp: new Date().toISOString(),
    capabilities: {
      autopilot: autopilotAvailable ? 'supported' : 'unsupported',
      // MSFS exposes the active FD state, but no generic runtime FD capability SimVar.
      // AP availability is the conservative baseline used until real-aircraft testing.
      flightDirector: autopilotAvailable ? 'supported' : 'unsupported',
      heading: capabilityFromEvidence(autopilotAvailable, headingEvidence),
      navigation: autopilotAvailable
        ? navigationAvailable
          ? 'supported'
          : 'unsupported'
        : 'unsupported',
      altitude: capabilityFromEvidence(autopilotAvailable, altitudeEvidence),
      verticalSpeed: capabilityFromEvidence(autopilotAvailable, verticalSpeedEvidence),
      // The official FLC event exists, but MSFS has no separate generic FLC capability flag.
      flightLevelChange: autopilotAvailable ? 'supported' : 'unsupported',
    },
    active,
    armed: {
      altitude: booleanValue(values, 'AUTOPILOT ALTITUDE ARM'),
    },
    targets: {
      altitudeFeet: requiredValue(values, 'AUTOPILOT ALTITUDE LOCK VAR'),
      headingDegrees: requiredValue(values, 'AUTOPILOT HEADING LOCK DIR'),
      speedKnots: requiredValue(values, 'AUTOPILOT AIRSPEED HOLD VAR'),
      verticalSpeedFpm: requiredValue(values, 'AUTOPILOT VERTICAL HOLD VAR'),
    },
  });
};

export type MsfsGuideServiceOptions = {
  trackIntervalMs: number;
  trackMaximumPoints: number;
};

export class MsfsGuideService {
  private readonly trackCache: MsfsTrackCache;
  private trackHandles: ProcessWatchHandle[] = [];
  private trackStarting: Promise<void> | null = null;
  private latestTrack: { latitude?: number; longitude?: number; altitudeFeet?: number } = {};
  private lastTrackPointAt = 0;
  private closed = false;
  private lastUnavailable = msfsUnavailableSchema.parse({
    status: 'unavailable',
    code: 'TRACK_HISTORY_EMPTY',
    message: '本次会话尚未积累可用的飞行轨迹。',
    source: 'msfs_cli',
    timestamp: new Date().toISOString(),
  });

  constructor(
    private readonly client: MsfsCliClient,
    private readonly options: MsfsGuideServiceOptions,
  ) {
    this.trackCache = new MsfsTrackCache(options.trackMaximumPoints);
  }

  async warmup(signal?: AbortSignal): Promise<MsfsReadiness> {
    const status = await this.client.execute(['status'], statusDataSchema, signal);
    if (status.status !== 'ok') return this.readinessFromFailure(status);

    const state = await this.client.execute(
      ['system', 'state', '--name', 'AircraftLoaded'],
      systemStateDataSchema,
      signal,
    );
    if (state.status !== 'ok') return this.readinessFromFailure(state);
    // AircraftLoaded is a string-valued SimConnect system state. Its integer
    // field is not a loaded/unloaded flag and is commonly zero even when the
    // returned aircraft path is valid.
    if (!state.data.value.string.trim()) {
      return msfsReadinessSchema.parse({
        status: 'simulator_not_ready',
        message: '模拟器已连接，但尚未进入已加载飞行的座舱。',
        code: 'SIM_NOT_READY',
        timestamp: new Date().toISOString(),
      });
    }

    await this.ensureTrackWatch();
    return msfsReadinessSchema.parse({
      status: 'ready',
      message: '模拟器飞行数据已就绪。',
      timestamp: new Date().toISOString(),
    });
  }

  async getFlightSnapshot(signal?: AbortSignal): Promise<FlightSnapshotResult> {
    const batch = await this.client.execute(
      ['simvar', 'batch', '--items', itemArgument(flightItems)],
      simvarBatchDataSchema,
      signal,
    );
    if (batch.status !== 'ok') return this.rememberFailure(batch);

    const title = await this.client.execute(
      ['simvar', 'get', '--name', 'TITLE', '--unit', 'string', '--datatype', 'string'],
      stringSimvarDataSchema,
      signal,
    );
    const tailNumber = await this.client.execute(
      ['simvar', 'get', '--name', 'ATC ID', '--unit', 'string', '--datatype', 'string'],
      stringSimvarDataSchema,
      signal,
    );

    try {
      const values = byName(batch.data.items);
      const result = flightSnapshotResultSchema.parse({
        status: 'ok',
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
        position: {
          latitude: requiredValue(values, 'PLANE LATITUDE'),
          longitude: requiredValue(values, 'PLANE LONGITUDE'),
          altitudeFeet: requiredValue(values, 'PLANE ALTITUDE'),
          groundAltitudeFeet: requiredValue(values, 'GROUND ALTITUDE'),
        },
        motion: {
          groundSpeedKnots: requiredValue(values, 'GROUND VELOCITY'),
          indicatedAirspeedKnots: requiredValue(values, 'AIRSPEED INDICATED'),
          verticalSpeedFeetPerMinute: requiredValue(values, 'VERTICAL SPEED'),
          headingTrueDegrees: requiredValue(values, 'PLANE HEADING DEGREES TRUE'),
        },
        attitude: {
          pitchDegrees: requiredValue(values, 'PLANE PITCH DEGREES'),
          bankDegrees: requiredValue(values, 'PLANE BANK DEGREES'),
        },
        onGround: requiredValue(values, 'SIM ON GROUND') !== 0,
        aircraft: {
          ...(title.status === 'ok' && title.data.value ? { title: title.data.value } : {}),
          ...(tailNumber.status === 'ok' && tailNumber.data.value
            ? { tailNumber: tailNumber.data.value }
            : {}),
        },
      });
      void this.ensureTrackWatch();
      return result;
    } catch {
      return this.protocolFailure();
    }
  }

  async getAutopilotAvailability(signal?: AbortSignal): Promise<AutopilotAvailabilityResult> {
    const result = await this.client.execute(
      ['simvar', 'get', '--name', 'AUTOPILOT AVAILABLE', '--unit', 'bool'],
      autopilotAvailabilityDataSchema,
      signal,
    );

    if (result.status !== 'ok') {
      return autopilotAvailabilitySchema.parse({
        status: 'unknown',
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
        code: result.code,
        message: '当前无法确认当前飞机是否具备可用的自动驾驶。',
      });
    }

    if (result.data.value !== 0 && result.data.value !== 1) {
      return autopilotAvailabilitySchema.parse({
        status: 'unknown',
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
        code: 'MSFS_CLI_PROTOCOL_ERROR',
        message: '自动驾驶可用性返回了无法识别的布尔值。',
      });
    }

    const available = result.data.value === 1;
    return autopilotAvailabilitySchema.parse({
      status: available ? 'supported' : 'unsupported',
      source: 'native_simconnect',
      timestamp: new Date().toISOString(),
      available,
      message: available ? '当前飞机报告具备可用的自动驾驶。' : '当前飞机报告没有可用的自动驾驶。',
    });
  }

  async getAutopilotStatus(signal?: AbortSignal): Promise<AutopilotStateResult> {
    const result = await this.client.execute(
      ['simvar', 'batch', '--items', itemArgument(autopilotItems)],
      simvarBatchDataSchema,
      signal,
    );
    if (result.status !== 'ok') return this.rememberFailure(result);

    try {
      return createAutopilotState(byName(result.data.items));
    } catch {
      return this.protocolFailure();
    }
  }

  async setAutopilot(
    input: SetAutopilotInput,
    signal?: AbortSignal,
  ): Promise<AutopilotActionResult> {
    const request = setAutopilotInputSchema.parse(input);
    const beforeResult = await this.getAutopilotStatus(signal);
    if (beforeResult.status !== 'ok') return beforeResult;
    const before: AutopilotState = beforeResult;

    const requiredCapabilities = new Map<keyof AutopilotState['capabilities'], string>();
    const requireCapability = (capability: keyof AutopilotState['capabilities'], label: string) => {
      requiredCapabilities.set(capability, label);
    };

    if (
      request.ap !== undefined ||
      request.lateralMode !== undefined ||
      request.verticalMode !== undefined ||
      request.targetSpeedKnots !== undefined
    ) {
      requireCapability('autopilot', '自动驾驶');
    }
    if (request.fd !== undefined) requireCapability('flightDirector', '飞行指引');
    if (request.lateralMode === 'HDG' || request.targetHeadingDegrees !== undefined) {
      requireCapability('heading', 'HDG 航向模式');
    }
    if (request.lateralMode === 'NAV') requireCapability('navigation', 'NAV 导航模式');
    if (request.verticalMode === 'ALT' || request.targetAltitudeFeet !== undefined) {
      requireCapability('altitude', 'ALT 高度保持');
    }
    if (request.verticalMode === 'VS' || request.targetVerticalSpeedFpm !== undefined) {
      requireCapability('verticalSpeed', 'VS 垂直速度模式');
    }
    if (request.verticalMode === 'FLC') requireCapability('flightLevelChange', 'FLC 高度层改变');

    let inputEvents: Map<string, string> | undefined;
    // Input Events are aircraft-specific controls. Their names do not prove that
    // a generic autopilot mode exists, nor that value 1 selects that mode.
    // They are only used for the two aircraft-specific AP/FD controls that have
    // been verified on the current aircraft; all named modes use official events.
    if (request.ap !== undefined || request.fd !== undefined) {
      inputEvents = await this.getAutopilotInputEvents(signal);
    }

    for (const [capability, label] of requiredCapabilities) {
      const status = before.capabilities[capability];
      if (status === 'supported') continue;
      return autopilotActionResultSchema.parse({
        status: 'rejected',
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
        message:
          status === 'unknown'
            ? `当前无法确认${label}是否可用，没有执行任何自动驾驶设置。`
            : `当前飞机不支持${label}，没有执行任何自动驾驶设置。`,
        requested: request,
        steps: [],
        state: before,
      });
    }

    type Action = {
      operation: string;
      capability?: AutopilotCapability;
      event?: string;
      data?: readonly number[];
      inputEventName?: string;
      inputEventValue?: number;
      shouldSend: (state: AutopilotState) => boolean;
    };
    const actions: Action[] = [];
    // Bring AP/FD up first, select the requested mode second, and write targets
    // last. Some aircraft reset a target when changing vertical mode.
    if (request.ap !== undefined) {
      actions.push({
        operation: request.ap ? '打开自动驾驶' : '关闭自动驾驶',
        capability: 'autopilot',
        event: 'AP_MASTER',
        inputEventName: 'AUTOPILOT_AP_MASTER',
        inputEventValue: 1,
        shouldSend: (state) => state.active.autopilot !== request.ap,
      });
    }
    if (request.fd !== undefined) {
      actions.push({
        operation: request.fd ? '打开飞行指引' : '关闭飞行指引',
        capability: 'flightDirector',
        event: 'TOGGLE_FLIGHT_DIRECTOR',
        inputEventName: 'AUTOPILOT_FLIGHT_DIRECTOR',
        inputEventValue: 1,
        shouldSend: (state) => state.active.flightDirector !== request.fd,
      });
    }
    if (request.lateralMode === 'HDG') {
      actions.push({
        operation: '切换到 HDG 航向模式',
        capability: 'heading',
        event: 'AP_PANEL_HEADING_ON',
        shouldSend: (state) => !state.active.heading,
      });
    } else if (request.lateralMode === 'NAV') {
      actions.push({
        operation: '切换到 NAV 导航模式',
        capability: 'navigation',
        event: 'AP_NAV1_HOLD_ON',
        shouldSend: (state) => !state.active.navigation,
      });
    }
    if (request.verticalMode === 'ALT') {
      actions.push({
        operation: '切换到 ALT 高度保持模式',
        capability: 'altitude',
        event: 'AP_PANEL_ALTITUDE_ON',
        shouldSend: (state) => !state.active.altitude,
      });
    } else if (request.verticalMode === 'VS') {
      actions.push({
        operation: '切换到 VS 垂直速度模式',
        capability: 'verticalSpeed',
        event: 'AP_VS_ON',
        shouldSend: (state) => !state.active.verticalSpeed,
      });
    } else if (request.verticalMode === 'FLC') {
      actions.push({
        operation: '切换到 FLC 高度层改变模式',
        capability: 'flightLevelChange',
        event: 'FLIGHT_LEVEL_CHANGE_ON',
        shouldSend: (state) => !state.active.flightLevelChange,
      });
    }
    if (request.targetHeadingDegrees !== undefined) {
      const target = normalizeHeading(request.targetHeadingDegrees);
      actions.push({
        operation: `设置目标航向 ${Math.round(target)} 度`,
        event: 'HEADING_BUG_SET',
        data: [Math.round(target), 0],
        shouldSend: (state) => circularHeadingDifference(state.targets.headingDegrees, target) > 1,
      });
    }
    if (request.targetAltitudeFeet !== undefined) {
      const target = Math.round(request.targetAltitudeFeet);
      actions.push({
        operation: `设置目标高度 ${target} 英尺`,
        event: 'AP_ALT_VAR_SET_ENGLISH',
        data: [target, 0],
        shouldSend: (state) => Math.abs(state.targets.altitudeFeet - target) > 1,
      });
    }
    if (request.targetSpeedKnots !== undefined) {
      const target = Math.round(request.targetSpeedKnots);
      actions.push({
        operation: `设置目标速度 ${target} 节`,
        event: 'AP_SPD_VAR_SET',
        data: [target, 0],
        shouldSend: (state) => Math.abs(state.targets.speedKnots - target) > 1,
      });
    }
    if (request.targetVerticalSpeedFpm !== undefined) {
      const target = Math.round(request.targetVerticalSpeedFpm);
      actions.push({
        operation: `设置目标垂直速度 ${target} 英尺/分钟`,
        event: 'AP_VS_VAR_SET_ENGLISH',
        data: [eventInteger(target), 0],
        shouldSend: (state) => Math.abs(state.targets.verticalSpeedFpm - target) > 1,
      });
    }

    const steps: AutopilotActionStep[] = [];
    let sentCount = 0;
    let current = before;
    const response = (
      status: 'ok' | 'rejected' | 'partial',
      message: string,
      state?: AutopilotState,
    ): AutopilotActionResult =>
      autopilotActionResultSchema.parse({
        status,
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
        message,
        requested: request,
        steps,
        ...(state ? { state } : {}),
      });

    for (const action of actions) {
      if (!action.shouldSend(current)) {
        steps.push({ operation: action.operation, status: 'skipped' });
        continue;
      }

      let eventResult: MsfsCommandResult<unknown>;
      if (action.inputEventName) {
        if (!inputEvents) inputEvents = await this.getAutopilotInputEvents(signal);
        const hash = inputEvents.get(action.inputEventName);
        eventResult = hash
          ? await this.sendAutopilotInput(hash, action.inputEventValue ?? 1, signal)
          : await this.sendAutopilotEvent(action.event ?? '', action.data, signal);
      } else {
        eventResult = await this.sendAutopilotEvent(action.event ?? '', action.data, signal);
      }
      if (eventResult.status !== 'ok') {
        this.rememberFailure(eventResult);
        steps.push({ operation: action.operation, status: 'failed' });
        const afterFailure = await this.getAutopilotStatus(signal);
        const state =
          afterFailure.status === 'ok' && action.capability
            ? stateWithUnsupportedCapabilities(afterFailure, [action.capability])
            : afterFailure.status === 'ok'
              ? afterFailure
              : undefined;
        return response(
          sentCount > 0 ? 'partial' : 'rejected',
          action.capability
            ? `当前飞机未提供或未确认支持${autopilotCapabilityLabels[action.capability]}，未执行“${action.operation}”后的后续设置。`
            : `自动驾驶操作在“${action.operation}”处失败，未继续执行后续设置。`,
          state,
        );
      }
      steps.push({ operation: action.operation, status: 'sent' });
      sentCount += 1;
      const afterAction = await this.getAutopilotStatus(signal);
      if (afterAction.status !== 'ok') {
        return response(
          'partial',
          `“${action.operation}”已发送，但无法读取该步骤执行后的实际状态。`,
        );
      }
      current = afterAction;
    }

    const after = current;

    const verificationFailures: string[] = [];
    const verificationCapabilityFailures = new Set<AutopilotCapability>();
    const addVerificationFailure = (label: string, capability?: AutopilotCapability) => {
      verificationFailures.push(label);
      if (capability) verificationCapabilityFailures.add(capability);
    };
    if (request.ap !== undefined && after.active.autopilot !== request.ap) {
      addVerificationFailure('自动驾驶总开关', 'autopilot');
    }
    if (request.fd !== undefined && after.active.flightDirector !== request.fd) {
      addVerificationFailure('飞行指引', 'flightDirector');
    }
    if (request.lateralMode === 'HDG' && !after.active.heading) {
      addVerificationFailure('HDG 航向模式', 'heading');
    }
    if (request.lateralMode === 'NAV' && !after.active.navigation) {
      addVerificationFailure('NAV 导航模式', 'navigation');
    }
    if (request.verticalMode === 'ALT' && !after.active.altitude) {
      addVerificationFailure('ALT 高度保持模式', 'altitude');
    }
    if (request.verticalMode === 'VS' && !after.active.verticalSpeed) {
      addVerificationFailure('VS 垂直速度模式', 'verticalSpeed');
    }
    if (request.verticalMode === 'FLC' && !after.active.flightLevelChange) {
      addVerificationFailure('FLC 高度层改变模式', 'flightLevelChange');
    }
    if (
      request.targetHeadingDegrees !== undefined &&
      circularHeadingDifference(after.targets.headingDegrees, request.targetHeadingDegrees) > 1
    ) {
      verificationFailures.push('目标航向');
    }
    if (
      request.targetAltitudeFeet !== undefined &&
      Math.abs(after.targets.altitudeFeet - request.targetAltitudeFeet) > 1
    ) {
      verificationFailures.push('目标高度');
    }
    if (
      request.targetSpeedKnots !== undefined &&
      Math.abs(after.targets.speedKnots - request.targetSpeedKnots) > 1
    ) {
      verificationFailures.push('目标速度');
    }
    if (
      request.targetVerticalSpeedFpm !== undefined &&
      Math.abs(after.targets.verticalSpeedFpm - request.targetVerticalSpeedFpm) > 1
    ) {
      verificationFailures.push('目标垂直速度');
    }

    if (verificationFailures.length > 0) {
      const state =
        verificationCapabilityFailures.size > 0
          ? stateWithUnsupportedCapabilities(after, verificationCapabilityFailures)
          : after;
      const unsupportedLabels = [...verificationCapabilityFailures].map(
        (capability) => autopilotCapabilityLabels[capability],
      );
      return response(
        'partial',
        unsupportedLabels.length > 0
          ? `当前飞机未提供或未确认支持${unsupportedLabels.join('、')}，相关设置没有生效；已停止后续设置。`
          : `事件已发送，但模拟器没有确认以下设置生效：${verificationFailures.join('、')}。`,
        state,
      );
    }
    return response(
      'ok',
      sentCount > 0 ? '自动驾驶设置已执行并确认生效。' : '自动驾驶已经处于请求状态。',
      after,
    );
  }

  async getLocationContext(signal?: AbortSignal): Promise<LocationContextResult> {
    const result = await this.client.execute(
      ['external', 'geo', 'context', '--from', 'aircraft', '--detail', 'auto'],
      geoContextDataSchema,
      signal,
    );
    if (result.status !== 'ok') return this.rememberFailure(result);
    const gamePois = normalizeGamePois(result.data.context);
    return locationContextResultSchema.parse({
      status: 'ok',
      source: result.data.origin,
      timestamp: new Date().toISOString(),
      context: result.data.context,
      gamePois,
    });
  }

  async getRouteBrief(signal?: AbortSignal): Promise<RouteBriefResult> {
    const result = await this.client.execute(
      ['route', 'get', '--source', 'efb'],
      routeDataSchema,
      signal,
    );
    if (result.status !== 'ok') return this.rememberFailure(result);
    return routeBriefResultSchema.parse({
      status: 'ok',
      source: 'native_efb',
      timestamp: new Date().toISOString(),
      route: result.data.route,
    });
  }

  async getNextWaypoint(signal?: AbortSignal): Promise<NextWaypointResult> {
    const [route, gps] = await Promise.all([
      this.client.execute(['route', 'get', '--source', 'efb'], routeDataSchema, signal),
      this.client.execute(
        ['simvar', 'get', '--name', 'GPS WP NEXT ID', '--unit', 'string', '--datatype', 'string'],
        stringSimvarDataSchema,
        signal,
      ),
    ]);
    if (route.status !== 'ok') return this.rememberFailure(route);
    if (gps.status !== 'ok') return this.rememberFailure(gps);
    const nextId = gps.data.value.trim();
    const normalized = nextId.toUpperCase();
    const nextWaypoint =
      route.data.route.enroute_legs.find(
        (leg) =>
          leg.icao.trim().toUpperCase() === normalized ||
          leg.name.trim().toUpperCase() === normalized,
      ) ?? null;
    return nextWaypointResultSchema.parse({
      status: 'ok',
      source: 'native_efb',
      timestamp: new Date().toISOString(),
      gpsNextId: nextId,
      nextWaypoint,
      route: {
        departureIcao: route.data.route.departure.icao,
        destinationIcao: route.data.route.destination.icao,
        totalEnrouteLegs: route.data.route.enroute_legs.length,
      },
    });
  }

  async getNearbyFacilities(
    type: 'airport' | 'waypoint' | 'ndb' | 'vor',
    radiusNm: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<NearbyFacilitiesResult> {
    const result = await this.client.execute(
      ['facilities', 'nearest', '--type', type, '--radius-nm', String(radiusNm)],
      facilitiesDataSchema,
      signal,
    );
    if (result.status !== 'ok') return this.rememberFailure(result);
    return nearbyFacilitiesResultSchema.parse({
      status: 'ok',
      source: 'native_simconnect_facilities',
      timestamp: new Date().toISOString(),
      type: result.data.type,
      radiusNm: result.data.radius_nm,
      facilities: [...result.data.facilities]
        .sort((first, second) => first.distance_nm - second.distance_nm)
        .slice(0, limit),
    });
  }

  async getWeatherAndSimTime(signal?: AbortSignal): Promise<WeatherAndSimTimeResult> {
    const result = await this.client.execute(
      ['simvar', 'batch', '--items', itemArgument(weatherItems)],
      simvarBatchDataSchema,
      signal,
    );
    if (result.status !== 'ok') return this.rememberFailure(result);
    try {
      const values = byName(result.data.items);
      return weatherAndSimTimeResultSchema.parse({
        status: 'ok',
        source: 'native_simconnect',
        timestamp: new Date().toISOString(),
        scope: 'simulator_environment',
        weather: {
          temperatureCelsius: requiredValue(values, 'AMBIENT TEMPERATURE'),
          windSpeedKnots: requiredValue(values, 'AMBIENT WIND VELOCITY'),
          windDirectionDegrees: requiredValue(values, 'AMBIENT WIND DIRECTION'),
          pressureInHg: requiredValue(values, 'AMBIENT PRESSURE'),
          visibilityMeters: requiredValue(values, 'AMBIENT VISIBILITY'),
        },
        simulatorTime: {
          zuluSecondsSinceMidnight: requiredValue(values, 'ZULU TIME'),
          localSecondsSinceMidnight: requiredValue(values, 'LOCAL TIME'),
          zuluYear: Math.trunc(requiredValue(values, 'ZULU YEAR')),
          zuluMonth: Math.trunc(requiredValue(values, 'ZULU MONTH OF YEAR')),
          zuluDay: Math.trunc(requiredValue(values, 'ZULU DAY OF MONTH')),
        },
      });
    } catch {
      return this.protocolFailure();
    }
  }

  getTrackHistory(limit: number): TrackHistoryResult {
    const points = this.trackCache.list(limit);
    if (points.length === 0) return this.lastUnavailable;
    return trackHistoryResultSchema.parse({
      status: 'ok',
      source: 'native_simconnect',
      timestamp: new Date().toISOString(),
      scope: 'current_agent_session',
      points,
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    const handles = this.trackHandles;
    this.trackHandles = [];
    this.trackStarting = null;
    await Promise.allSettled(handles.map((handle) => handle.stop()));
    this.trackCache.clear();
  }

  private async ensureTrackWatch(): Promise<void> {
    if (this.closed) return;
    if (this.trackHandles.length > 0) return;
    if (this.trackStarting) return this.trackStarting;
    this.trackStarting = Promise.resolve().then(() => {
      if (this.closed) return;
      const watched = [
        ['PLANE LATITUDE', 'degrees'],
        ['PLANE LONGITUDE', 'degrees'],
        ['PLANE ALTITUDE', 'feet'],
      ] as const;
      this.trackHandles = watched.map(([name, unit]) =>
        this.client.watch(
          [
            'simvar',
            'watch',
            '--name',
            name,
            '--unit',
            unit,
            '--interval-ms',
            String(this.options.trackIntervalMs),
            '--count',
            '0',
          ],
          (envelope) => {
            if (!envelope.ok) return;
            const parsed = simvarItemSchema.safeParse(envelope.data);
            if (!parsed.success) return;
            if (parsed.data.name === 'PLANE LATITUDE') {
              this.latestTrack.latitude = parsed.data.value;
            } else if (parsed.data.name === 'PLANE LONGITUDE') {
              this.latestTrack.longitude = parsed.data.value;
            } else if (parsed.data.name === 'PLANE ALTITUDE') {
              this.latestTrack.altitudeFeet = parsed.data.value;
            }
            this.captureTrackPoint();
          },
          () => undefined,
        ),
      );
    });
    try {
      await this.trackStarting;
    } finally {
      this.trackStarting = null;
    }
  }

  private captureTrackPoint(): void {
    const { latitude, longitude, altitudeFeet } = this.latestTrack;
    const now = Date.now();
    if (
      latitude === undefined ||
      longitude === undefined ||
      now - this.lastTrackPointAt < Math.max(500, this.options.trackIntervalMs / 2)
    ) {
      return;
    }
    this.lastTrackPointAt = now;
    this.trackCache.add({
      latitude,
      longitude,
      ...(altitudeFeet === undefined ? {} : { altitudeFeet }),
      timestamp: new Date(now).toISOString(),
    });
  }

  private sendAutopilotEvent(
    event: string,
    data: readonly number[] | undefined,
    signal?: AbortSignal,
  ) {
    return this.client.execute(
      [
        'key-event',
        'send',
        '--name',
        event,
        ...(data && data.length > 0 ? ['--data', data.join(',')] : []),
        '--unsafe',
      ],
      keyEventDataSchema,
      signal,
    );
  }

  private async getAutopilotInputEvents(signal?: AbortSignal): Promise<Map<string, string>> {
    const result = await this.client.execute(['input', 'list'], inputEventListDataSchema, signal);
    if (result.status !== 'ok') return new Map();
    return new Map(result.data.events.map((event) => [event.name, event.hash]));
  }

  private sendAutopilotInput(hash: string, value: number, signal?: AbortSignal) {
    return this.client.execute(
      ['input', 'set', '--hash', hash, '--value', String(value), '--unsafe'],
      inputEventSetDataSchema,
      signal,
    );
  }

  private rememberFailure<T>(failure: Exclude<MsfsCommandResult<T>, { status: 'ok' }>) {
    this.lastUnavailable = failure;
    return failure;
  }

  private protocolFailure() {
    return this.rememberFailure({
      status: 'unavailable',
      code: 'MSFS_CLI_PROTOCOL_ERROR',
      message: 'MSFS CLI 返回了无法识别的数据。',
      source: 'msfs_cli',
      timestamp: new Date().toISOString(),
    });
  }

  private readinessFromFailure<T>(
    failure: Exclude<MsfsCommandResult<T>, { status: 'ok' }>,
  ): MsfsReadiness {
    this.lastUnavailable = failure;
    const simulatorUnavailable =
      failure.code === 'SIM_NOT_READY' || failure.code === 'SIM_POSITION_UNAVAILABLE';
    return msfsReadinessSchema.parse({
      status: simulatorUnavailable ? 'simulator_not_ready' : 'cli_unavailable',
      message: failure.message,
      code: failure.code,
      timestamp: new Date().toISOString(),
    });
  }
}
