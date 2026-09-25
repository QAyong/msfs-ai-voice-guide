import { z } from 'zod';

export const simvarItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  datatype: z.string().min(1),
  value: z.number().finite(),
});

export const simvarBatchDataSchema = z.object({
  items: z.array(simvarItemSchema),
});

export const stringSimvarDataSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  datatype: z.literal('STRING256'),
  value: z.string(),
});

export const autopilotAvailabilityDataSchema = simvarItemSchema.extend({
  name: z.literal('AUTOPILOT AVAILABLE'),
});

export const keyEventDataSchema = z.object({
  name: z.string().min(1),
  sent: z.literal(true),
});

export const inputEventListDataSchema = z.object({
  events: z.array(
    z.object({
      name: z.string().min(1),
      hash: z.string().regex(/^\d+$/),
      type: z.number().int(),
    }),
  ),
});

export const inputEventSetDataSchema = z.object({
  hash: z.string().regex(/^\d+$/),
  value: z.number().finite(),
  set: z.literal(true),
});

const aircraftProbeErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .nullable();

const aircraftProbeModeTestSchema = z.object({
  id: z.string().min(1),
  readback: z.string().min(1),
  on_event: z.string().min(1),
  off_event: z.string().min(1),
  status: z.enum(['supported', 'unsupported', 'unknown']),
  initial: z.number().finite().nullable(),
  after_on: z.number().finite().nullable(),
  after_off: z.number().finite().nullable(),
  error: aircraftProbeErrorSchema,
});

const aircraftProbeResultSchema = z.object({
  aircraft_title: z.string().min(1),
  status: z.enum(['supported', 'unsupported', 'unknown']),
  autopilot_available: z.number().finite(),
  autopilot_master: z.number().finite(),
  flight_director_active: z.number().finite(),
  heading_lock: z.number().finite(),
  nav1_lock: z.number().finite(),
  altitude_lock: z.number().finite(),
  vertical_hold: z.number().finite(),
  flight_level_change: z.number().finite(),
  temporary_ai: z.boolean(),
  object_removed: z.boolean(),
  error: aircraftProbeErrorSchema,
  mode_tests: z.array(aircraftProbeModeTestSchema).optional(),
});

export const aircraftProbeDataSchema = z.object({
  schema_version: z.number().int().positive(),
  type: z.literal('aircraft'),
  status: z.enum(['complete', 'partial', 'error']),
  temporary_ai: z.boolean(),
  user_aircraft_switched: z.boolean(),
  autopilot_write_attempted: z.boolean(),
  candidate_title_count: z.number().int().nonnegative(),
  candidate_title_offset: z.number().int().nonnegative().optional(),
  candidate_title_total_count: z.number().int().nonnegative().optional(),
  probed_title_count: z.number().int().nonnegative(),
  supported_count: z.number().int().nonnegative(),
  unsupported_count: z.number().int().nonnegative(),
  unknown_count: z.number().int().nonnegative(),
  mode_probe_requested: z.boolean().optional(),
  mode_tested_aircraft_count: z.number().int().nonnegative().optional(),
  mode_supported_count: z.number().int().nonnegative().optional(),
  mode_unsupported_count: z.number().int().nonnegative().optional(),
  mode_unknown_count: z.number().int().nonnegative().optional(),
  cleanup: z.object({
    status: z.enum(['complete', 'partial', 'error']),
    objects_created: z.number().int().nonnegative(),
    objects_removed: z.number().int().nonnegative(),
    unresolved_objects: z.number().int().nonnegative(),
  }),
  error: aircraftProbeErrorSchema,
  results: z.array(aircraftProbeResultSchema),
});

export const aircraftListDataSchema = z.object({
  type: z.string().min(1),
  items: z.array(
    z.object({
      aircraft_title: z.string(),
      livery_name: z.string(),
    }),
  ),
});

export const inputEventParamsDataSchema = z.object({
  hash: z.string().regex(/^\d+$/),
  params: z.string(),
});

export const inputEventValueDataSchema = z.object({
  hash: z.string().regex(/^\d+$/),
  type: z.number().int(),
  value: z.number().finite(),
});

export const statusDataSchema = z.object({
  daemon: z.string().min(1),
  simconnect: z.object({
    sdk_compiled: z.boolean(),
    connected: z.boolean(),
    transport: z.string().min(1),
  }),
  route_bridge: z
    .object({
      transport: z.string().min(1),
      installed: z.string(),
    })
    .optional(),
});

export const systemStateDataSchema = z.object({
  name: z.string().min(1),
  value: z.object({
    integer: z.number(),
    float: z.number(),
    string: z.string(),
  }),
});

export const facilitySchema = z.object({
  type: z.enum(['airport', 'waypoint', 'ndb', 'vor']),
  icao: z.string(),
  region: z.string(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude_m: z.number().finite(),
  distance_nm: z.number().finite().nonnegative(),
});

export const facilitiesDataSchema = z.object({
  type: z.enum(['airport', 'waypoint', 'ndb', 'vor']),
  radius_nm: z.number().finite().nonnegative(),
  facilities: z.array(facilitySchema),
});

const routeAirportSchema = z.object({
  icao: z.string(),
  runway_number: z.number().int(),
  runway_designator: z.number().int(),
});

export const routeLegSchema = z.object({
  type: z.number().int(),
  icao: z.string(),
  name: z.string(),
  via: z.string(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
});

export const routeSchema = z.object({
  departure: routeAirportSchema.extend({
    sid: z.string(),
    transition: z.string(),
  }),
  destination: routeAirportSchema.extend({
    star: z.string(),
    transition: z.string(),
  }),
  approach: z.object({
    type: z.number().int(),
    suffix: z.string(),
  }),
  cruise_altitude: z.object({
    type: z.number().int(),
    value: z.number().int(),
  }),
  is_vfr: z.boolean(),
  enroute_legs: z.array(routeLegSchema),
});

export const routeDataSchema = z.object({
  source: z.literal('efb'),
  route: routeSchema,
});

export const geoContextDataSchema = z.object({
  origin: z.literal('external_geo_cloud'),
  context: z.record(z.string(), z.unknown()),
});

export const trackPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitudeFeet: z.number().finite().optional(),
  timestamp: z.string().datetime(),
});

export type TrackPoint = z.infer<typeof trackPointSchema>;
