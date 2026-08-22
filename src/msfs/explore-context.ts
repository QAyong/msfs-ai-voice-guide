import { z } from 'zod';
import { gamePoiSchema, type MsfsGuideService } from './guide-service.js';

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
  gamePois: z.array(gamePoiSchema).max(5).optional(),
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

const optionalText = (value: unknown, maximum = 120) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, maximum);
};

const textAt = (value: Record<string, unknown> | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const candidate = optionalText(value?.[key]);
    if (candidate) return candidate;
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
    const [snapshotResult, locationResult, routeResult] = await Promise.allSettled([
      this.service.getFlightSnapshot(signal),
      this.service.getLocationContext(signal),
      this.service.getRouteBrief(signal),
    ]);
    if (signal?.aborted)
      throw new DOMException('The MSFS context request was cancelled.', 'AbortError');
    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : undefined;
    const location = locationResult.status === 'fulfilled' ? locationResult.value : undefined;
    const route = routeResult.status === 'fulfilled' ? routeResult.value : undefined;
    const geo = location?.status === 'ok' ? record(location.context) : undefined;
    const place = record(geo?.place) ?? record(geo?.address) ?? record(geo?.administrative) ?? geo;
    const country = textAt(place, 'country', 'country_name');
    const region = textAt(place, 'region', 'state', 'province', 'admin1');
    const city = textAt(place, 'city', 'town', 'municipality');
    const locality = textAt(place, 'locality', 'district', 'suburb');
    const placeContext =
      country || region || city || locality
        ? {
            ...(country ? { country } : {}),
            ...(region ? { region } : {}),
            ...(city ? { city } : {}),
            ...(locality ? { locality } : {}),
          }
        : undefined;
    const originIcao =
      route?.status === 'ok' ? optionalText(route.route.departure.icao, 16) : undefined;
    const destinationIcao =
      route?.status === 'ok' ? optionalText(route.route.destination.icao, 16) : undefined;
    const routeContext =
      originIcao || destinationIcao
        ? {
            ...(originIcao ? { originIcao } : {}),
            ...(destinationIcao ? { destinationIcao } : {}),
          }
        : undefined;
    const parsed = msfsExploreContextSchema.safeParse({
      capturedAt: new Date().toISOString(),
      ...(snapshot?.status === 'ok'
        ? {
            position: {
              latitude: snapshot.position.latitude,
              longitude: snapshot.position.longitude,
              altitudeMeters: snapshot.position.altitudeFeet * 0.3048,
              headingDegrees: snapshot.motion.headingTrueDegrees,
            },
          }
        : {}),
      ...(placeContext ? { place: placeContext } : {}),
      ...(location?.status === 'ok' && location.gamePois?.length
        ? { gamePois: location.gamePois }
        : {}),
      ...(routeContext ? { route: routeContext } : {}),
    });
    if (!parsed.success) return undefined;
    const context = parsed.data;
    return context.position || context.place || context.gamePois || context.route
      ? context
      : undefined;
  }
}
