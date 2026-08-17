import { describe, expect, it } from 'vitest';
import { normalizeGamePois } from '../../src/msfs/guide-service.js';

describe('MSFS game POI normalization', () => {
  it('normalizes, sorts, deduplicates, and limits Geo Cloud POIs', () => {
    const result = normalizeGamePois({
      game_poi: {
        nearby: [
          { name: 'Far landmark', type: 'MVA', dist_km: 8, source: 'geo' },
          { name: 'Near landmark', type: 'MVA', dist_km: 2, source: 'geo' },
          { name: 'near landmark', type: 'MVA', dist_km: 3, source: 'geo' },
          { name: 'No distance', type: 'PPLX', source: 'geo' },
          { name: '', dist_km: 0 },
        ],
      },
    });

    expect(result).toEqual([
      { name: 'Near landmark', type: 'MVA', distanceKm: 2, providerSource: 'geo' },
      { name: 'Far landmark', type: 'MVA', distanceKm: 8, providerSource: 'geo' },
      { name: 'No distance', type: 'PPLX', providerSource: 'geo' },
    ]);
  });

  it('returns an empty list when Geo Cloud has no nearby game POIs', () => {
    expect(normalizeGamePois({ game_poi: { nearby: [] } })).toEqual([]);
    expect(normalizeGamePois({})).toEqual([]);
  });
});
