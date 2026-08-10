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
import type { MsfsCliDiagnostic } from '../../src/msfs/cli-client.js';

class FakeRunner implements MsfsProcessRunner {
  readonly calls: Array<readonly string[]> = [];

  constructor(
    private readonly result: ProcessRunResult | Error | Array<ProcessRunResult | Error>,
  ) {}

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    this.calls.push(args);
    const result = Array.isArray(this.result) ? this.result.shift() : this.result;
    if (!result) throw new Error('Fake runner has no result');
    if (result instanceof Error) throw result;
    return result;
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

  it('routes requests to the configured daemon role', async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: '{"id":"monitor","ok":true,"data":{"value":1}}',
      stderr: '',
      timedOut: false,
    });
    const client = new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 1,
      role: 'monitor',
      runner,
    });

    await expect(client.execute(['status'], z.object({ value: z.number() }))).resolves.toMatchObject({
      status: 'ok',
      requestId: 'monitor',
    });
    expect(runner.calls[0]).toEqual(['status', '--role', 'monitor', '--json']);
  });

  it('emits a request timeline without exposing CLI output', async () => {
    const events: MsfsCliDiagnostic[] = [];
    const client = new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 1,
      runner: new FakeRunner({
        exitCode: 0,
        stdout: '{"id":"timeline","ok":true,"data":{"value":42}}',
        stderr: 'sensitive stderr',
        timedOut: false,
      }),
      onDiagnostic: (event) => events.push(event),
    });

    await client.execute(['status'], z.object({ value: z.number() }));

    expect(events.find((event) => event.kind === 'runtime')).toMatchObject({
      operation: 'client',
      timeoutMs: 100,
      maxConcurrency: 1,
    });
    expect(events.find((event) => event.kind === 'request_start')).toMatchObject({
      operation: 'status',
      attempt: 1,
    });
    expect(events.find((event) => event.kind === 'request_end')).toMatchObject({
      operation: 'status',
      outcome: 'ok',
      requestId: 'timeline',
    });
    expect(JSON.stringify(events)).not.toContain('sensitive stderr');
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

  it('retries a timeout once before returning success', async () => {
    const runner = new FakeRunner([
      { exitCode: null, stdout: '', stderr: '', timedOut: true },
      {
        exitCode: 0,
        stdout: '{"id":"retry","ok":true,"data":{"value":7}}',
        stderr: '',
        timedOut: false,
      },
    ]);
    const client = new MsfsCliClient({
      executablePath: process.execPath,
      timeoutMs: 100,
      maxConcurrency: 1,
      runner,
    });

    await expect(client.execute(['status'], z.object({ value: z.number() }))).resolves.toEqual({
      status: 'ok',
      requestId: 'retry',
      data: { value: 7 },
    });
    expect(runner.calls).toHaveLength(2);
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
