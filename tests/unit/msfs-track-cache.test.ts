import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { MsfsGuideService } from '../../src/msfs/guide-service.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';
import { MsfsTrackCache } from '../../src/msfs/track-cache.js';

describe('MsfsTrackCache', () => {
  it('keeps a bounded session-only history and removes duplicate points', () => {
    const cache = new MsfsTrackCache(2);
    const first = {
      latitude: 31.2,
      longitude: 121.4,
      altitudeFeet: 1000,
      timestamp: '2026-07-24T00:00:00.000Z',
    };

    cache.add(first);
    cache.add({ ...first, timestamp: '2026-07-24T00:00:01.000Z' });
    cache.add({
      latitude: 31.3,
      longitude: 121.5,
      altitudeFeet: 1200,
      timestamp: '2026-07-24T00:00:02.000Z',
    });
    cache.add({
      latitude: 31.4,
      longitude: 121.6,
      altitudeFeet: 1300,
      timestamp: '2026-07-24T00:00:03.000Z',
    });

    expect(cache.size).toBe(2);
    expect(cache.list()).toEqual([
      expect.objectContaining({ latitude: 31.3 }),
      expect.objectContaining({ latitude: 31.4 }),
    ]);
    cache.clear();
    expect(cache.list()).toEqual([]);
  });
});

class TrackingRunner implements MsfsProcessRunner {
  stopped = 0;

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    const data =
      args[0] === 'status'
        ? {
            daemon: 'ready',
            simconnect: { sdk_compiled: true, connected: true, transport: 'SimConnect' },
          }
        : {
            name: 'AircraftLoaded',
            value: {
              integer: 0,
              float: 0,
              string: 'SimObjects\\Airplanes\\asobo_c172sp_g1000\\aircraft.CFG',
            },
          };
    return {
      exitCode: 0,
      stdout: JSON.stringify({ id: 'ready', ok: true, data }),
      stderr: '',
      timedOut: false,
    };
  }

  watch(...[, args, callbacks]: Parameters<MsfsProcessRunner['watch']>): ProcessWatchHandle {
    const name = args[args.indexOf('--name') + 1];
    const unit = args[args.indexOf('--unit') + 1];
    if (!name || !unit) throw new Error('watch args are incomplete');
    const value = name === 'PLANE LATITUDE' ? 31.2 : name === 'PLANE LONGITUDE' ? 121.4 : 2500;
    callbacks.onLine(
      JSON.stringify({
        id: `watch-${name}`,
        ok: true,
        data: { name, unit, datatype: 'FLOAT64', value },
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

describe('MSFS track watch lifecycle', () => {
  it('starts one bounded session watch set and cancels all processes on close', async () => {
    const runner = new TrackingRunner();
    const service = new MsfsGuideService(
      new MsfsCliClient({
        executablePath: process.execPath,
        timeoutMs: 100,
        maxConcurrency: 2,
        runner,
      }),
      { trackIntervalMs: 1000, trackMaximumPoints: 10 },
    );

    await expect(service.warmup()).resolves.toMatchObject({ status: 'ready' });
    expect(service.getTrackHistory(10)).toMatchObject({
      status: 'ok',
      scope: 'current_agent_session',
      points: [expect.objectContaining({ latitude: 31.2, longitude: 121.4 })],
    });
    await service.close();
    expect(runner.stopped).toBe(3);
    expect(service.getTrackHistory(10)).toMatchObject({ status: 'unavailable' });
  });
});
