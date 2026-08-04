import { z } from 'zod';
import { MsfsCliClient } from './cli-client.js';
import {
  facilitiesDataSchema,
  geoContextDataSchema,
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
  msfsReadinessSchema,
  msfsUnavailableSchema,
  type MsfsCommandResult,
  type MsfsReadiness,
} from './types.js';
import type { ProcessWatchHandle } from './process-runner.js';

const sourceSchema = z.literal('native_simconnect');
const timestampSchema = z.string().datetime();

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
    const [batch, title, tailNumber] = await Promise.all([
      this.client.execute(
        ['simvar', 'batch', '--items', itemArgument(flightItems)],
        simvarBatchDataSchema,
        signal,
      ),
      this.client.execute(
        ['simvar', 'get', '--name', 'TITLE', '--unit', 'string', '--datatype', 'string'],
        stringSimvarDataSchema,
        signal,
      ),
      this.client.execute(
        ['simvar', 'get', '--name', 'ATC ID', '--unit', 'string', '--datatype', 'string'],
        stringSimvarDataSchema,
        signal,
      ),
    ]);
    if (batch.status !== 'ok') return this.rememberFailure(batch);

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

  async getLocationContext(signal?: AbortSignal): Promise<LocationContextResult> {
    const result = await this.client.execute(
      ['external', 'geo', 'context', '--from', 'aircraft', '--detail', 'auto'],
      geoContextDataSchema,
      signal,
    );
    if (result.status !== 'ok') return this.rememberFailure(result);
    return locationContextResultSchema.parse({
      status: 'ok',
      source: result.data.origin,
      timestamp: new Date().toISOString(),
      context: result.data.context,
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
