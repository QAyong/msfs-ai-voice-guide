import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { z } from 'zod';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { resolveMsfsCliPath } from '../../src/msfs/path.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

class FakeRunner implements MsfsProcessRunner {
  readonly calls: Array<readonly string[]> = [];

  constructor(private readonly result: ProcessRunResult | Error) {}

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    this.calls.push(args);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }

  watch(): ProcessWatchHandle {
    return { completion: Promise.resolve(), stop: async () => undefined };
  }
}

const createClient = (result: ProcessRunResult | Error) =>
  new MsfsCliClient({
    executablePath: process.execPath,
    timeoutMs: 100,
    maxConcurrency: 1,
    runner: new FakeRunner(result),
  });

describe('MsfsCliClient', () => {
  it('parses and validates a successful JSON envelope', async () => {
    const client = createClient({
      exitCode: 0,
      stdout: '{"id":"one","ok":true,"data":{"value":42}}',
      stderr: '',
      timedOut: false,
    });

    await expect(client.execute(['status'], z.object({ value: z.number() }))).resolves.toEqual({
      status: 'ok',
      requestId: 'one',
      data: { value: 42 },
    });
  });

  it('preserves known domain errors while removing the raw CLI message', async () => {
    const client = createClient({
      exitCode: 1,
      stdout:
        '{"id":"two","ok":false,"error":{"code":"ROUTE_NOT_FOUND","message":"raw internal detail"}}',
      stderr: 'secret diagnostic',
      timedOut: false,
    });

    const result = await client.execute(['route', 'get'], z.unknown());

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'ROUTE_NOT_FOUND',
      requestId: 'two',
    });
    expect(JSON.stringify(result)).not.toContain('raw internal detail');
    expect(JSON.stringify(result)).not.toContain('secret diagnostic');
  });

  it('normalizes malformed output, timeouts and spawn failures', async () => {
    const malformed = createClient({
      exitCode: 0,
      stdout: 'not json',
      stderr: '',
      timedOut: false,
    });
    const timeout = createClient({
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: true,
    });
    const spawnFailure = createClient(new Error('sensitive path'));

    await expect(malformed.execute(['status'], z.unknown())).resolves.toMatchObject({
      code: 'MSFS_CLI_PROTOCOL_ERROR',
    });
    await expect(timeout.execute(['status'], z.unknown())).resolves.toMatchObject({
      code: 'MSFS_CLI_TIMEOUT',
    });
    await expect(spawnFailure.execute(['status'], z.unknown())).resolves.toMatchObject({
      code: 'MSFS_CLI_UNAVAILABLE',
    });
  });
});

describe('resolveMsfsCliPath', () => {
  it('prefers a configured development path and otherwise uses packaged resources', () => {
    expect(resolveMsfsCliPath({ configuredPath: 'tools/msfs.exe', cwd: 'C:\\project' })).toBe(
      'C:\\project\\tools\\msfs.exe',
    );
    expect(resolveMsfsCliPath({ resourcesPath: 'C:\\app\\resources' })).toBe(
      'C:\\app\\resources\\msfs\\msfs.exe',
    );
    expect(
      resolveMsfsCliPath({
        developmentPath: resolve('package.json'),
        resourcesPath: 'C:\\app\\resources',
      }),
    ).toBe(resolve('package.json'));
  });
});
