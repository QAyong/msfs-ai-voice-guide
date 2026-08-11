import { mkdtemp, readFile, readdir, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DiagnosticLogger,
  redactDiagnosticValue,
  writeDiagnosticArchive,
} from '../../desktop/main/diagnostics.js';

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'msfs-guide-diagnostics-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('desktop diagnostics', () => {
  it('redacts secrets in objects, headers, bearer values, and URL query parameters', () => {
    const result = redactDiagnosticValue({
      apiKey: 'key-must-not-escape',
      Authorization: 'Bearer jwt-must-not-escape',
      detail: 'access_token=token-must-not-escape',
      rawJson: '{"apiKey":"json-must-not-escape"}',
      source: 'https://example.test/path?query=weather&token=must-not-escape',
      nested: { cookie: 'session-must-not-escape' },
    });
    const serialized = JSON.stringify(result.value);

    expect(result.count).toBeGreaterThanOrEqual(5);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain('must-not-escape');
    expect(serialized).not.toContain('key-must-not-escape');
    expect(serialized).not.toContain('json-must-not-escape');
  });

  it('keeps daily NDJSON logs within the configured size cap', async () => {
    const directory = await createTemporaryDirectory();
    const logger = new DiagnosticLogger({
      directory,
      maximumBytes: 160,
      maximumAgeMs: 3 * 24 * 60 * 60 * 1_000,
    });

    await logger.append('main', {
      message: 'first diagnostic event with enough text to exceed the cap',
    });
    await logger.append('worker', {
      message: 'second diagnostic event with enough text to exceed the cap',
    });

    const names = await readdir(directory);
    const total = await Promise.all(names.map(async (name) => stat(join(directory, name))));
    expect(total.reduce((sum, details) => sum + details.size, 0)).toBeLessThanOrEqual(160);
  });

  it('prunes expired files before taking a snapshot', async () => {
    const directory = await createTemporaryDirectory();
    const now = new Date('2026-08-11T00:00:00.000Z');
    const logger = new DiagnosticLogger({
      directory,
      maximumAgeMs: 3 * 24 * 60 * 60 * 1_000,
      now: () => now,
    });

    await logger.append('main', { message: 'expired diagnostic event' });
    const logPath = join(directory, 'main-2026-08-11.ndjson');
    const expiredAt = new Date('2026-08-07T00:00:00.000Z');
    await utimes(logPath, expiredAt, expiredAt);

    const snapshot = await logger.snapshot();

    expect(snapshot.files.main).toBe('');
    expect(await readdir(directory)).not.toContain('main-2026-08-11.ndjson');
  });

  it('writes a standard ZIP with the required diagnostic entries', async () => {
    const directory = await createTemporaryDirectory();
    const targetPath = join(directory, 'diagnostics.zip');
    await writeDiagnosticArchive({
      targetPath,
      manifest: { formatVersion: 1 },
      readiness: { status: 'ready' },
      configurationSummary: { locale: 'zh-CN', apiKey: 'must-not-reach-the-zip' },
      snapshot: {
        files: {
          main: '{"event":"started"}\n',
          worker: '',
          conversation: '{"role":"user","text":"hello"}\n',
          'tool-events': '',
        },
        redactionCount: 0,
        timeRange: { from: null, to: null },
      },
    });

    const archive = await readFile(targetPath);
    expect(archive.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(archive.toString('utf8')).toContain('configuration-summary.json');
    expect(archive.toString('utf8')).toContain('conversation.ndjson');
    expect(archive.toString('utf8')).not.toContain('must-not-reach-the-zip');
  });
});
