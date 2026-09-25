import { describe, expect, it } from 'vitest';
import {
  classifyAircraftPackage,
  parseAircraftCfg,
} from '../../src/msfs/official-aircraft-catalog.js';

describe('MSFS official aircraft catalog', () => {
  it('parses aircraft.cfg identity and multiple variants without treating it as JSON', () => {
    const parsed = parseAircraftCfg(`
      [GENERAL]
      ui_typerole = Twin Engine Prop

      [FLTSIM.0]
      title = C172SP G1000 Cargo
      ui_manufacturer = Cessna
      ui_type = C172SP
      ui_variation = Cargo
      ui_createdby = Asobo Studio
      ui_typerole = Single Engine Prop
      icao_type = C172

      [FLTSIM.1]
      title = C172SP G1000 Passenger
      ui_manufacturer = Cessna
      ui_type = C172SP
      ui_variation = Passenger
      icao_type = C172
    `);

    expect(parsed.identity).toMatchObject({
      title: 'C172SP G1000 Cargo',
      manufacturer: 'Cessna',
      model: 'C172SP',
      variant: 'Cargo',
      icao: 'C172',
      uiCreatedBy: 'Asobo Studio',
      uiTypeRole: 'Single Engine Prop',
    });
    expect(parsed.variants).toHaveLength(2);
    expect(parsed.variants[1]?.title).toBe('C172SP G1000 Passenger');
  });

  it('keeps direct official aircraft in scope and profile-eligible only when flyable', () => {
    expect(
      classifyAircraftPackage({
        packageName: 'fs24-asobo-aircraft-c172sp-as1000',
        creator: 'Asobo Studio',
      }),
    ).toMatchObject({
      generation: 'msfs2024',
      packageRole: 'flyable',
      boundaryStatus: 'official',
      inScope: true,
      profileEligible: true,
      autopilot: { status: 'unknown' },
    });

    expect(
      classifyAircraftPackage({
        packageName: 'fs24-asobo-passiveaircraft-c172family',
        creator: 'Asobo Studio',
      }),
    ).toMatchObject({
      boundaryStatus: 'official',
      inScope: true,
      packageRole: 'passive',
      profileEligible: false,
      autopilot: { status: 'unknown' },
    });
  });

  it('includes a partner aircraft in static scope without making it executable', () => {
    const input = {
      packageName: 'fs24-asobo-aircraft-tbm930',
      creator: 'Working Title Simulations',
    };
    expect(classifyAircraftPackage(input, [])).toMatchObject({
      boundaryStatus: 'official_partner_candidate',
      inScope: true,
      profileEligible: true,
      autopilot: { status: 'unknown' },
    });
    expect(classifyAircraftPackage(input)).toMatchObject({
      boundaryStatus: 'official_partner_allowed',
      inScope: true,
      profileEligible: true,
      autopilot: { status: 'unknown' },
    });
  });

  it('keeps MSFS 2020 compatibility packages outside the MSFS 2024 boundary', () => {
    expect(
      classifyAircraftPackage({
        packageName: 'fs20-asobo-aircraft-t6-reno-common',
        creator: 'Asobo Studio',
      }),
    ).toMatchObject({
      generation: 'legacy_msfs2020',
      boundaryStatus: 'out_of_scope_legacy',
      inScope: false,
      profileEligible: false,
      autopilot: { status: 'unknown' },
    });
  });

  it('removes only aircraft with explicit official no-autopilot evidence', () => {
    expect(
      classifyAircraftPackage({
        packageName: 'fs24-asobo-aircraft-e330',
        creator: 'Asobo Studio',
      }),
    ).toMatchObject({
      packageRole: 'flyable',
      boundaryStatus: 'official',
      inScope: true,
      profileEligible: false,
      autopilot: { status: 'unsupported' },
    });

    expect(
      classifyAircraftPackage({
        packageName: 'fs24-asobo-aircraft-vl3',
        creator: 'Asobo Studio',
      }),
    ).toMatchObject({
      packageRole: 'flyable',
      boundaryStatus: 'official',
      inScope: true,
      profileEligible: false,
      autopilot: { status: 'unsupported' },
    });

    expect(
      classifyAircraftPackage({
        packageName: 'fs24-asobo-aircraft-c152',
        creator: 'Asobo Studio',
      }),
    ).toMatchObject({
      packageRole: 'flyable',
      boundaryStatus: 'official',
      inScope: true,
      profileEligible: true,
      autopilot: { status: 'unknown' },
    });
  });
});
