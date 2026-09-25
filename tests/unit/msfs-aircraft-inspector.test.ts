import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import {
  autopilotInspectionSimvars,
  inspectCurrentAircraft,
} from '../../src/msfs/aircraft-inspector.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

const identityValues: Record<string, string> = {
  TITLE: 'C172SP G1000 Cargo',
  'ATC MODEL': 'C172',
  'ATC TYPE': 'C172',
  'ATC ID': 'N172AI',
};

const optionValue = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const success = (id: string, data: unknown): ProcessRunResult => ({
  exitCode: 0,
  stdout: JSON.stringify({ id, ok: true, data }),
  stderr: '',
  timedOut: false,
});

const failure = (id: string, code: string): ProcessRunResult => ({
  exitCode: 1,
  stdout: JSON.stringify({
    id,
    ok: false,
    error: { code, message: 'raw simulator detail must not escape the client' },
  }),
  stderr: 'raw stderr must not escape the client',
  timedOut: false,
});

class FakeRunner implements MsfsProcessRunner {
  readonly calls: Array<readonly string[]> = [];

  constructor(
    private readonly autopilotAvailable = 1,
    private readonly failingSimvars = new Set<string>(),
    private readonly aircraftLoadedPath = 'SimObjects\\Airplanes\\test\\aircraft.CFG',
  ) {}

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    this.calls.push(args);
    const command = `${args[0] ?? ''} ${args[1] ?? ''}`;
    if (command === 'system state') {
      return success('system', {
        name: 'AircraftLoaded',
        value: { integer: 0, float: 0, string: this.aircraftLoadedPath },
      });
    }
    if (command === 'simvar get') {
      const name = optionValue(args, '--name') ?? '';
      if (this.failingSimvars.has(name)) return failure(name, 'SIM_NOT_READY');
      if (name in identityValues) {
        return success(name, {
          name,
          unit: 'string',
          datatype: 'STRING256',
          value: identityValues[name],
        });
      }
      const item = autopilotInspectionSimvars.find((candidate) => candidate.name === name);
      if (!item) throw new Error(`Unexpected SimVar ${name}`);
      return success(name, {
        name,
        unit: item.unit,
        datatype: 'FLOAT64',
        value: name === 'AUTOPILOT AVAILABLE' ? this.autopilotAvailable : 0,
      });
    }
    if (command === 'aircraft list') {
      return success('aircraft-list', {
        type: optionValue(args, '--type') ?? 'aircraft',
        items: [
          { aircraft_title: 'C172SP G1000 Cargo', livery_name: 'Asobo' },
          { aircraft_title: 'C172SP G1000 Cargo', livery_name: 'Cargo' },
          { aircraft_title: 'Cessna 208B Grand Caravan EX', livery_name: 'Asobo' },
        ],
      });
    }
    if (command === 'input list') {
      return success('input-list', {
        events: [
          { name: 'AUTOPILOT_AP_MASTER', hash: '1001', type: 0 },
          { name: 'GEAR_TOGGLE', hash: '1002', type: 0 },
        ],
      });
    }
    if (command === 'input params') {
      const hash = optionValue(args, '--hash') ?? '';
      return success('input-params', { hash, params: '0|1' });
    }
    if (command === 'input get') {
      const hash = optionValue(args, '--hash') ?? '';
      return success('input-get', { hash, type: 0, value: 1 });
    }
    throw new Error(`Unexpected command ${command}`);
  }

  watch(): ProcessWatchHandle {
    return { completion: Promise.resolve(), stop: async () => undefined };
  }
}

const createInspector = (runner: FakeRunner) =>
  inspectCurrentAircraft(
    new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 1,
      role: 'monitor',
      runner,
    }),
    { maxInputEventDetails: 16 },
  );

describe('MSFS current aircraft inspector', () => {
  it('collects identity, autopilot SimVars and relevant Input Events without writes', async () => {
    const runner = new FakeRunner();
    const inspection = await createInspector(runner);

    expect(inspection).toMatchObject({
      source: 'native_simconnect',
      readOnly: true,
      writesAttempted: false,
      collection: { status: 'complete' },
      aircraft: {
        loaded: { status: 'ok', value: true },
        loadedPath: { status: 'ok', value: 'SimObjects\\Airplanes\\test\\aircraft.CFG' },
        title: { status: 'ok', value: 'C172SP G1000 Cargo' },
        model: { status: 'ok', value: 'C172' },
      },
      autopilot: { availability: 'supported' },
      spawnableAircraft: {
        status: 'ok',
        uniqueTitleCount: 2,
        items: [
          expect.objectContaining({ aircraft_title: 'C172SP G1000 Cargo' }),
          expect.objectContaining({ aircraft_title: 'C172SP G1000 Cargo', livery_name: 'Cargo' }),
          expect.objectContaining({ aircraft_title: 'Cessna 208B Grand Caravan EX' }),
        ],
      },
    });
    expect(inspection.autopilot.inputEvents.events).toEqual([
      expect.objectContaining({
        name: 'AUTOPILOT_AP_MASTER',
        relevant: true,
        params: { status: 'ok', value: '0|1' },
        value: { status: 'ok', value: 1 },
      }),
      expect.objectContaining({ name: 'GEAR_TOGGLE', relevant: false }),
    ]);
    expect(inspection.autopilot.simvars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'AUTOPILOT HEADING SLOT INDEX' }),
        expect.objectContaining({ name: 'AUTOPILOT ALTITUDE SLOT INDEX' }),
        expect.objectContaining({ name: 'AUTOPILOT VS SLOT INDEX' }),
        expect.objectContaining({ name: 'AUTOPILOT SPEED SLOT INDEX' }),
      ]),
    );
    expect(runner.calls.every((args) => !args.includes('--unsafe'))).toBe(true);
  });

  it('maps AUTOPILOT AVAILABLE=0 to unsupported without changing the simulator', async () => {
    const inspection = await createInspector(new FakeRunner(0));

    expect(inspection.autopilot.availability).toBe('unsupported');
    expect(inspection.writesAttempted).toBe(false);
  });

  it('uses the AircraftLoaded path instead of its integer field', async () => {
    const inspection = await createInspector(new FakeRunner(1, new Set(), ''));

    expect(inspection.aircraft.loaded).toMatchObject({ status: 'ok', value: false });
    expect(inspection.aircraft.loadedPath).toMatchObject({ status: 'ok', value: '' });
  });

  it('keeps partial read failures explicit and does not expose raw CLI details', async () => {
    const inspection = await createInspector(
      new FakeRunner(1, new Set(['ATC TYPE', 'AUTOPILOT AVAILABLE'])),
    );

    expect(inspection.collection.status).toBe('partial');
    expect(inspection.autopilot.availability).toBe('unknown');
    expect(inspection.aircraft.type).toMatchObject({
      status: 'unavailable',
      code: 'SIM_NOT_READY',
    });
    expect(JSON.stringify(inspection)).not.toContain('raw simulator detail');
    expect(JSON.stringify(inspection)).not.toContain('raw stderr');
  });
});
