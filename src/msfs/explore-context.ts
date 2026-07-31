import { z } from 'zod';
import type { MsfsGuideService } from './guide-service.js';

export const msfsExploreContextSchema = z.object({
  capturedAt: z.string().datetime(),
  position: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      altitudeMeters: z.number().finite().optional(),
      headingDegrees: z.number().finite().optional(),
    })
    .optional(),
  place: z
    .object({
      country: z.string().trim().min(1).max(120).optional(),
      region: z.string().trim().min(1).max(120).optional(),
      city: z.string().trim().min(1).max(120).optional(),
      locality: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
  route: z
    .object({
      originIcao: z.string().trim().min(1).max(16).optional(),
      destinationIcao: z.string().trim().min(1).max(16).optional(),
    })
    .optional(),
});

export type MsfsExploreContext = z.infer<typeof msfsExploreContextSchema>;

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const textAt = (value: Record<string, unknown> | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 120);
  }
  return undefined;
};

/**
 * Maps only the existing high-level MSFS service outputs to Planner-safe context.
 * It deliberately does not expose CLI arguments, telemetry noise, or raw geo payloads.
 */
export class MsfsExploreContextProvider {
  constructor(
    private readonly service: Pick<
      MsfsGuideService,
      'getFlightSnapshot' | 'getLocationContext' | 'getRouteBrief'
    >,
  ) {}

  async get(signal?: AbortSignal): Promise<MsfsExploreContext | undefined> {
    const [snapshot, location, route] = await Promise.all([
      this.service.getFlightSnapshot(signal),
      this.service.getLocationContext(signal),
      this.service.getRouteBrief(signal),
    ]);
    const geo = location.status === 'ok' ? record(location.context) : undefined;
    const place = record(geo?.place) ?? record(geo?.address) ?? geo;
    const parsed = msfsExploreContextSchema.safeParse({
      capturedAt: new Date().toISOString(),
      ...(snapshot.status === 'ok'
        ? {
            position: {
              latitude: snapshot.position.latitude,
              longitude: snapshot.position.longitude,
              altitudeMeters: snapshot.position.altitudeFeet * 0.3048,
              headingDegrees: snapshot.motion.headingTrueDegrees,
            },
          }
        : {}),
      ...(place
        ? {
            place: {
              ...(textAt(place, 'country', 'country_name')
                ? { country: textAt(place, 'country', 'country_name') }
                : {}),
              ...(textAt(place, 'region', 'state', 'province')
                ? { region: textAt(place, 'region', 'state', 'province') }
                : {}),
              ...(textAt(place, 'city', 'town', 'municipality')
                ? { city: textAt(place, 'city', 'town', 'municipality') }
                : {}),
              ...(textAt(place, 'locality', 'district', 'suburb')
                ? { locality: textAt(place, 'locality', 'district', 'suburb') }
                : {}),
            },
          }
        : {}),
      ...(route.status === 'ok'
        ? {
            route: {
              originIcao: route.route.departure.icao,
              destinationIcao: route.route.destination.icao,
            },
          }
        : {}),
    });
    if (!parsed.success) return undefined;
    const context = parsed.data;
    return context.position || context.place || context.route ? context : undefined;
  }
}
