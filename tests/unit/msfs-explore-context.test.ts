import { describe, expect, it } from 'vitest';
import { MsfsExploreContextProvider } from '../../src/msfs/explore-context.js';
import type {
  FlightSnapshotResult,
  LocationContextResult,
  RouteBriefResult,
} from '../../src/msfs/guide-service.js';
import type { MsfsUnavailableCode } from '../../src/msfs/types.js';

const unavailable = (code: MsfsUnavailableCode = 'SIM_NOT_READY') => ({
  status: 'unavailable' as const,
  code,
  message: '不可用',
  source: 'msfs_cli' as const,
  timestamp: '2026-07-30T00:00:00.000Z',
});

const provider = ({
  snapshot = unavailable(),
  location = unavailable(),
  route = unavailable(),
}: {
  snapshot?: FlightSnapshotResult;
  location?: LocationContextResult;
  route?: RouteBriefResult;
} = {}) =>
  new MsfsExploreContextProvider({
    getFlightSnapshot: async () => snapshot,
    getLocationContext: async () => location,
    getRouteBrief: async () => route,
  });

const snapshot: FlightSnapshotResult = {
  status: 'ok',
  source: 'native_simconnect',
  timestamp: '2026-07-30T00:00:00.000Z',
  position: {
    latitude: 38.351269,
    longitude: 120.772148,
    altitudeFeet: 1520,
    groundAltitudeFeet: 0,
  },
  motion: {
    groundSpeedKnots: 112,
    indicatedAirspeedKnots: 109,
    verticalSpeedFeetPerMinute: 1299,
    headingTrueDegrees: 90,
  },
  attitude: { pitchDegrees: -6, bankDegrees: 0 },
  onGround: false,
  aircraft: { title: 'NXCub Aerial Advertising', tailNumber: 'ASXGS' },
};

describe('MsfsExploreContextProvider', () => {
  it('keeps position when an otherwise valid VFR route has empty airport ICAOs', async () => {
    const context = await provider({ snapshot }).get();

    expect(context).toMatchObject({
      position: { latitude: 38.351269, longitude: 120.772148 },
    });
    expect(context).not.toHaveProperty('route');
  });

  it('accepts place context when position and route are unavailable', async () => {
    const context = await provider({
      location: {
        status: 'ok',
        source: 'external_geo_cloud',
        timestamp: '2026-07-30T00:00:00.000Z',
        context: { administrative: { country: '中国', admin1: '山东省' } },
        gamePois: [
          {
            name: '泰山',
            type: 'MVA',
            distanceKm: 12,
            providerSource: 'geo_cloud',
          },
        ],
      },
    }).get();

    expect(context).toMatchObject({
      place: { country: '中国', region: '山东省' },
      gamePois: [{ name: '泰山', distanceKm: 12 }],
    });
  });

  it('accepts a partially populated route context', async () => {
    const context = await provider({
      route: {
        status: 'ok',
        source: 'native_efb',
        timestamp: '2026-07-30T00:00:00.000Z',
        route: {
          departure: { icao: '', runway_number: 0, runway_designator: 0, sid: '', transition: '' },
          destination: {
            icao: 'ZBAA',
            runway_number: 0,
            runway_designator: 0,
            star: '',
            transition: '',
          },
          approach: { type: 0, suffix: '' },
          cruise_altitude: { type: 0, value: 0 },
          is_vfr: true,
          enroute_legs: [],
        },
      },
    }).get();

    expect(context).toMatchObject({ route: { destinationIcao: 'ZBAA' } });
  });

  it('returns unavailable only when all game context sources are unavailable', async () => {
    await expect(provider().get()).resolves.toBeUndefined();
  });

  it('keeps successful MSFS fields when another context read fails', async () => {
    const partialProvider = new MsfsExploreContextProvider({
      getFlightSnapshot: async () => snapshot,
      getLocationContext: async () => {
        throw new Error('geo provider unavailable');
      },
      getRouteBrief: async () => {
        throw new Error('route provider unavailable');
      },
    });

    await expect(partialProvider.get()).resolves.toMatchObject({
      position: { latitude: 38.351269, longitude: 120.772148 },
    });
  });
});
