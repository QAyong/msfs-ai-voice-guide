import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { MsfsGuideService } from '../../src/msfs/guide-service.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

type MockAutopilotState = {
  available: number;
  master: number;
  flightDirector: number;
  defaultRollMode: number;
  defaultPitchMode: number;
  headingManuallyTunable: number;
  headingLock: number;
  heading: number;
  navAvailable: number;
  navLock: number;
  altitudeManuallyTunable: number;
  altitudeArm: number;
  altitudeLock: number;
  altitude: number;
  verticalHold: number;
  verticalSpeed: number;
  flightLevelChange: number;
  airspeedHold: number;
  airspeed: number;
};

const defaultState = (): MockAutopilotState => ({
  available: 1,
  master: 0,
  flightDirector: 0,
  defaultRollMode: 2,
  defaultPitchMode: 0,
  headingManuallyTunable: 1,
  headingLock: 0,
  heading: 0,
  navAvailable: 1,
  navLock: 0,
  altitudeManuallyTunable: 1,
  altitudeArm: 0,
  altitudeLock: 0,
  altitude: 5_000,
  verticalHold: 0,
  verticalSpeed: 0,
  flightLevelChange: 0,
  airspeedHold: 0,
  airspeed: 120,
});

class AutopilotRunner implements MsfsProcessRunner {
  readonly calls: Array<readonly string[]> = [];
  readonly state: MockAutopilotState;
  readonly inputEventNames: readonly string[];

  constructor(
    overrides: Partial<MockAutopilotState> = {},
    inputEventNames: readonly string[] = ['AUTOPILOT_FLIGHT_DIRECTOR'],
  ) {
    this.state = { ...defaultState(), ...overrides };
    this.inputEventNames = inputEventNames;
  }

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    this.calls.push(args);
    if (args[0] === 'simvar' && args[1] === 'batch') return this.batchResult(args);
    if (args[0] === 'key-event' && args[1] === 'send') return this.keyEventResult(args);
    if (args[0] === 'input' && args[1] === 'list') {
      return success({
        events: this.inputEventNames.map((name, index) => ({
          name,
          hash: String(8_809_818_232_898_411_929n + BigInt(index)),
          type: 0,
        })),
      });
    }
    if (args[0] === 'input' && args[1] === 'set') {
      if (!args.includes('--unsafe')) throw new Error('input write command was not marked unsafe');
      this.state.flightDirector = this.state.flightDirector === 1 ? 0 : 1;
      return success({
        hash: args[args.indexOf('--hash') + 1],
        value: Number(args[args.indexOf('--value') + 1]),
        set: true,
      });
    }
    throw new Error(`Unexpected fake CLI command: ${args.join(' ')}`);
  }

  watch(): ProcessWatchHandle {
    return { completion: Promise.resolve(), stop: async () => undefined };
  }

  private batchResult(args: readonly string[]): ProcessRunResult {
    const itemArgument = args[args.indexOf('--items') + 1] ?? '';
    const items = itemArgument.split(';').map((item) => {
      const [name = '', unit = ''] = item.split('|');
      return {
        name,
        unit,
        datatype: 'FLOAT64',
        value: this.valueFor(name),
      };
    });
    return success({ items });
  }

  private keyEventResult(args: readonly string[]): ProcessRunResult {
    const name = args[args.indexOf('--name') + 1];
    const dataText = args.includes('--data') ? (args[args.indexOf('--data') + 1] ?? '') : '';
    const data = dataText.split(',').filter(Boolean).map(Number);
    if (!args.includes('--unsafe')) throw new Error('write command was not marked unsafe');

    switch (name) {
      case 'AP_MASTER':
        this.state.master = this.state.master === 1 ? 0 : 1;
        break;
      case 'TOGGLE_FLIGHT_DIRECTOR':
        this.state.flightDirector = this.state.flightDirector === 1 ? 0 : 1;
        break;
      case 'HEADING_BUG_SET':
        this.state.heading = data[0] ?? this.state.heading;
        break;
      case 'AP_ALT_VAR_SET_ENGLISH':
        this.state.altitude = data[0] ?? this.state.altitude;
        break;
      case 'AP_SPD_VAR_SET':
        this.state.airspeed = data[0] ?? this.state.airspeed;
        break;
      case 'AP_VS_VAR_SET_ENGLISH': {
        const value = data[0] ?? 0;
        this.state.verticalSpeed = value > 0x7fffffff ? value - 0x1_0000_0000 : value;
        break;
      }
      case 'AP_PANEL_HEADING_ON':
        this.state.headingLock = 1;
        break;
      case 'AP_NAV1_HOLD_ON':
        this.state.navLock = 1;
        break;
      case 'AP_PANEL_ALTITUDE_ON':
        this.state.altitudeLock = 1;
        break;
      case 'AP_VS_ON':
        this.state.verticalHold = 1;
        break;
      case 'FLIGHT_LEVEL_CHANGE_ON':
        this.state.flightLevelChange = 1;
        break;
      default:
        throw new Error(`Unexpected autopilot event: ${name}`);
    }
    return success({ name, sent: true });
  }

  private valueFor(name: string): number {
    const values: Record<string, number> = {
      'AUTOPILOT AVAILABLE': this.state.available,
      'AUTOPILOT MASTER': this.state.master,
      'AUTOPILOT FLIGHT DIRECTOR ACTIVE': this.state.flightDirector,
      'AUTOPILOT DEFAULT ROLL MODE': this.state.defaultRollMode,
      'AUTOPILOT DEFAULT PITCH MODE': this.state.defaultPitchMode,
      'AUTOPILOT HEADING MANUALLY TUNABLE': this.state.headingManuallyTunable,
      'AUTOPILOT HEADING LOCK': this.state.headingLock,
      'AUTOPILOT HEADING LOCK DIR': this.state.heading,
      'NAV AVAILABLE:1': this.state.navAvailable,
      'AUTOPILOT NAV1 LOCK': this.state.navLock,
      'AUTOPILOT ALTITUDE MANUALLY TUNABLE': this.state.altitudeManuallyTunable,
      'AUTOPILOT ALTITUDE ARM': this.state.altitudeArm,
      'AUTOPILOT ALTITUDE LOCK': this.state.altitudeLock,
      'AUTOPILOT ALTITUDE LOCK VAR': this.state.altitude,
      'AUTOPILOT VERTICAL HOLD': this.state.verticalHold,
      'AUTOPILOT VERTICAL HOLD VAR': this.state.verticalSpeed,
      'AUTOPILOT FLIGHT LEVEL CHANGE': this.state.flightLevelChange,
      'AUTOPILOT AIRSPEED HOLD': this.state.airspeedHold,
      'AUTOPILOT AIRSPEED HOLD VAR': this.state.airspeed,
    };
    const value = values[name];
    if (value === undefined) throw new Error(`Unexpected fake SimVar: ${name}`);
    return value;
  }
}

const success = (data: unknown): ProcessRunResult => ({
  exitCode: 0,
  stdout: JSON.stringify({ id: 'autopilot-test', ok: true, data }),
  stderr: '',
  timedOut: false,
});

const createService = (runner: AutopilotRunner) =>
  new MsfsGuideService(
    new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 1,
      runner,
    }),
    { trackIntervalMs: 3_000, trackMaximumPoints: 120 },
  );

const keyEventNames = (runner: AutopilotRunner) =>
  runner.calls
    .filter((args) => args[0] === 'key-event')
    .map((args) => args[args.indexOf('--name') + 1]);

describe('MSFS autopilot actions', () => {
  it('reads all relevant state in one batch and reports mode evidence', async () => {
    const runner = new AutopilotRunner();
    const service = createService(runner);

    await expect(service.getAutopilotStatus()).resolves.toMatchObject({
      status: 'ok',
      capabilities: {
        autopilot: 'supported',
        heading: 'supported',
        navigation: 'supported',
        altitude: 'supported',
        verticalSpeed: 'unknown',
        flightLevelChange: 'supported',
      },
      active: { autopilot: false, heading: false },
    });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.slice(0, 2)).toEqual(['simvar', 'batch']);
  });

  it('preflights, sends only whitelisted events, and verifies the result', async () => {
    const runner = new AutopilotRunner();
    const service = createService(runner);

    const result = await service.setAutopilot({
      ap: true,
      lateralMode: 'HDG',
      targetHeadingDegrees: 90,
      verticalMode: 'ALT',
      targetAltitudeFeet: 6_000,
    });

    expect(result).toMatchObject({ status: 'ok', state: { active: { autopilot: true } } });
    expect(keyEventNames(runner)).toEqual([
      'AP_MASTER',
      'AP_PANEL_HEADING_ON',
      'AP_PANEL_ALTITUDE_ON',
      'HEADING_BUG_SET',
      'AP_ALT_VAR_SET_ENGLISH',
    ]);
    expect(runner.calls.filter((args) => args[0] === 'simvar')).toHaveLength(6);
    expect(runner.calls.filter((args) => args[0] === 'key-event').every((args) => args.includes('--unsafe'))).toBe(
      true,
    );
  });

  it('encodes a negative vertical speed for the unsigned CLI event parameter', async () => {
    const runner = new AutopilotRunner({ defaultPitchMode: 3 });
    const service = createService(runner);

    const result = await service.setAutopilot({
      ap: true,
      verticalMode: 'VS',
      targetVerticalSpeedFpm: -500,
    });

    expect(result).toMatchObject({ status: 'ok' });
    const eventCall = runner.calls.find(
      (args) => args[0] === 'key-event' && args[args.indexOf('--name') + 1] === 'AP_VS_VAR_SET_ENGLISH',
    );
    expect(eventCall).toContain('4294966796,0');
  });

  it('does not treat a mode-named Input Event as proof that VS is supported', async () => {
    const runner = new AutopilotRunner(
      {},
      ['AUTOPILOT_FLIGHT_DIRECTOR', 'AUTOPILOT_VS_MODE'],
    );
    const service = createService(runner);

    await expect(
      service.setAutopilot({ fd: true, verticalMode: 'VS', targetVerticalSpeedFpm: 300 }),
    ).resolves.toMatchObject({
      status: 'rejected',
      message: '当前无法确认VS 垂直速度模式是否可用，没有执行任何自动驾驶设置。',
    });
    expect(keyEventNames(runner)).toEqual([]);
    expect(runner.calls.some((args) => args[0] === 'input' && args[1] === 'set')).toBe(false);
  });

  it('uses the official VS Key Event even when the aircraft exposes a VS Input Event', async () => {
    const runner = new AutopilotRunner(
      { defaultPitchMode: 3 },
      ['AUTOPILOT_FLIGHT_DIRECTOR', 'AUTOPILOT_VS_MODE'],
    );
    const service = createService(runner);

    await expect(
      service.setAutopilot({ fd: true, verticalMode: 'VS', targetVerticalSpeedFpm: 300 }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(keyEventNames(runner)).toEqual(['AP_VS_ON', 'AP_VS_VAR_SET_ENGLISH']);
    expect(runner.calls.filter((args) => args[0] === 'input' && args[1] === 'set')).toHaveLength(1);
  });

  it('refuses an HDG request when the mode cannot be confirmed and sends nothing', async () => {
    const runner = new AutopilotRunner({
      defaultRollMode: 0,
      headingManuallyTunable: 0,
    });
    const service = createService(runner);

    await expect(service.setAutopilot({ lateralMode: 'HDG' })).resolves.toMatchObject({
      status: 'rejected',
      message: '当前无法确认HDG 航向模式是否可用，没有执行任何自动驾驶设置。',
    });
    expect(keyEventNames(runner)).toEqual([]);
  });

  it('refuses every write when AUTOPILOT AVAILABLE is false', async () => {
    const runner = new AutopilotRunner({ available: 0 });
    const service = createService(runner);

    await expect(service.setAutopilot({ ap: true })).resolves.toMatchObject({
      status: 'rejected',
      message: '当前飞机不支持自动驾驶，没有执行任何自动驾驶设置。',
    });
    expect(keyEventNames(runner)).toEqual([]);
  });

  it('uses the current aircraft FD input event when it is available', async () => {
    const runner = new AutopilotRunner({ flightDirector: 1 });
    const service = createService(runner);

    await expect(service.setAutopilot({ fd: false })).resolves.toMatchObject({
      status: 'ok',
      state: { active: { flightDirector: false } },
    });
    expect(runner.calls.some((args) => args[0] === 'input' && args[1] === 'list')).toBe(true);
    expect(runner.calls.some((args) => args[0] === 'input' && args[1] === 'set')).toBe(true);
    expect(keyEventNames(runner)).toEqual([]);
  });
});
