import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { MsfsGuideService } from '../../src/msfs/guide-service.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

class FakeRunner implements MsfsProcessRunner {
  readonly calls: Array<readonly string[]> = [];

  constructor(private readonly result: ProcessRunResult) {}

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    this.calls.push(args);
    return this.result;
  }

  watch(): ProcessWatchHandle {
    return { completion: Promise.resolve(), stop: async () => undefined };
  }
}

const createService = (result: ProcessRunResult) => {
  const runner = new FakeRunner(result);
  const service = new MsfsGuideService(
    new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 1,
      runner,
    }),
    { trackIntervalMs: 3000, trackMaximumPoints: 120 },
  );
  return { runner, service };
};

const success = (value: number): ProcessRunResult => ({
  exitCode: 0,
  stdout: JSON.stringify({
    id: 'autopilot-availability',
    ok: true,
    data: {
      name: 'AUTOPILOT AVAILABLE',
      unit: 'bool',
      datatype: 'FLOAT64',
      value,
    },
  }),
  stderr: '',
  timedOut: false,
});

describe('MSFS autopilot availability', () => {
  it('maps AUTOPILOT AVAILABLE=1 to supported without sending a write command', async () => {
    const { runner, service } = createService(success(1));

    await expect(service.getAutopilotAvailability()).resolves.toMatchObject({
      status: 'supported',
      available: true,
    });
    expect(runner.calls).toEqual([
      ['simvar', 'get', '--name', 'AUTOPILOT AVAILABLE', '--unit', 'bool', '--role', 'ai', '--json'],
    ]);
  });

  it('maps AUTOPILOT AVAILABLE=0 to unsupported', async () => {
    const { service } = createService(success(0));

    await expect(service.getAutopilotAvailability()).resolves.toMatchObject({
      status: 'unsupported',
      available: false,
    });
  });

  it('maps a simulator failure to unknown without exposing the CLI message', async () => {
    const { service } = createService({
      exitCode: 1,
      stdout: JSON.stringify({
        id: 'offline',
        ok: false,
        error: { code: 'SIM_NOT_READY', message: 'raw simulator detail' },
      }),
      stderr: '',
      timedOut: false,
    });

    const result = await service.getAutopilotAvailability();

    expect(result).toMatchObject({ status: 'unknown', code: 'SIM_NOT_READY' });
    expect(JSON.stringify(result)).not.toContain('raw simulator detail');
  });

  it('maps a non-boolean value to unknown', async () => {
    const { service } = createService(success(2));

    await expect(service.getAutopilotAvailability()).resolves.toMatchObject({
      status: 'unknown',
      code: 'MSFS_CLI_PROTOCOL_ERROR',
    });
  });
});
