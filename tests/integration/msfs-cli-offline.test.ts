import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { MsfsGuideService } from '../../src/msfs/guide-service.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

class OfflineRunner implements MsfsProcessRunner {
  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    const route = args[0] === 'route';
    const geo = args[0] === 'external';
    const code = route
      ? 'ROUTE_BRIDGE_UNAVAILABLE'
      : geo
        ? 'EXTERNAL_GEO_UNAVAILABLE'
        : 'SIM_NOT_READY';
    return {
      exitCode: 1,
      stdout: JSON.stringify({
        id: 'offline',
        ok: false,
        error: { code, message: 'raw internal detail' },
      }),
      stderr: '',
      timedOut: false,
    };
  }

  watch(): ProcessWatchHandle {
    throw new Error('offline warmup must not start a watch process');
  }
}

const service = new MsfsGuideService(
  new MsfsCliClient({
    executablePath: process.execPath,
    timeoutMs: 100,
    maxConcurrency: 2,
    runner: new OfflineRunner(),
  }),
  { trackIntervalMs: 3000, trackMaximumPoints: 120 },
);

describe('MSFS offline behavior', () => {
  it('keeps simulator, route bridge and external geo failures distinguishable', async () => {
    await expect(service.getFlightSnapshot()).resolves.toMatchObject({
      status: 'unavailable',
      code: 'SIM_NOT_READY',
    });
    await expect(service.getRouteBrief()).resolves.toMatchObject({
      status: 'unavailable',
      code: 'ROUTE_BRIDGE_UNAVAILABLE',
    });
    await expect(service.getLocationContext()).resolves.toMatchObject({
      status: 'unavailable',
      code: 'EXTERNAL_GEO_UNAVAILABLE',
    });
  });

  it('reports a non-blocking simulator readiness state', async () => {
    await expect(service.warmup()).resolves.toMatchObject({
      status: 'simulator_not_ready',
      code: 'SIM_NOT_READY',
    });
  });
});
