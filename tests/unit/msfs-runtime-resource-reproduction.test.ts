import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { MsfsGuideService } from '../../src/msfs/guide-service.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

/**
 * These are characterization tests for unresolved runtime diagnostics.
 * They intentionally capture the current behavior so the suspected lifecycle
 * paths can be reproduced before a production fix is selected.
 */
abstract class ReadyRunner implements MsfsProcessRunner {
  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    if (args[0] === 'status') {
      return this.success({
        daemon: 'ready',
        simconnect: { sdk_compiled: true, connected: true, transport: 'SimConnect' },
      });
    }
    if (args[0] === 'system') {
      return this.success({
        name: 'AircraftLoaded',
        value: {
          integer: 0,
          float: 0,
          string: 'SimObjects\\Airplanes\\test\\aircraft.CFG',
        },
      });
    }
    throw new Error(`unexpected run: ${args.join(' ')}`);
  }

  protected success(data: unknown): ProcessRunResult {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ id: 'runtime-test', ok: true, data }),
      stderr: '',
      timedOut: false,
    };
  }

  abstract watch(
    executable: string,
    args: readonly string[],
    callbacks: Parameters<MsfsProcessRunner['watch']>[2],
  ): ProcessWatchHandle;
}

class PartialStartRunner extends ReadyRunner {
  attempts = 0;
  started = 0;
  stopped = 0;

  watch(...[, , callbacks]: Parameters<MsfsProcessRunner['watch']>): ProcessWatchHandle {
    this.attempts += 1;
    if (this.attempts === 3) {
      throw new Error('injected third watcher startup failure');
    }

    this.started += 1;
    callbacks.onLine(
      JSON.stringify({
        id: `watch-${this.started}`,
        ok: true,
        data: {
          name: this.started === 1 ? 'PLANE LATITUDE' : 'PLANE LONGITUDE',
          unit: 'degrees',
          datatype: 'FLOAT64',
          value: this.started === 1 ? 31.2 : 121.4,
        },
      }),
    );
    return {
      completion: Promise.resolve(),
      stop: async () => {
        this.stopped += 1;
      },
    };
  }
}

class ExitedWatchRunner extends ReadyRunner {
  watchCalls = 0;

  watch(...[, , callbacks]: Parameters<MsfsProcessRunner['watch']>): ProcessWatchHandle {
    this.watchCalls += 1;
    callbacks.onClose?.(1);
    return {
      completion: Promise.resolve(),
      stop: async () => undefined,
    };
  }
}

const createService = (runner: MsfsProcessRunner) =>
  new MsfsGuideService(
    new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 2,
      runner,
    }),
    { trackIntervalMs: 1000, trackMaximumPoints: 10 },
  );

describe('unresolved MSFS runtime resource paths', () => {
  it('reproduces lost handles when the third watcher fails during startup', async () => {
    const runner = new PartialStartRunner();
    const service = createService(runner);

    await expect(service.warmup()).rejects.toThrow('injected third watcher startup failure');
    await service.close();

    expect(runner.started).toBe(2);
    expect(runner.stopped).toBe(0);
  });

  it('reproduces a stale handle set after all watchers exit', async () => {
    const runner = new ExitedWatchRunner();
    const service = createService(runner);

    await service.warmup();
    await service.warmup();

    expect(runner.watchCalls).toBe(3);
  });
});
