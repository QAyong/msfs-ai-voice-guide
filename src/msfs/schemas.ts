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
