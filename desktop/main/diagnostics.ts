import archiver from 'archiver';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const redacted = '[REDACTED]';
const diagnosticStreams = ['main', 'worker', 'conversation', 'tool-events'] as const;
type DiagnosticStream = (typeof diagnosticStreams)[number];

const sensitiveKey =
  /(?:api[_-]?key|access[_-]?token|token|secret|jwt|authorization|cookie|credential|password)/iu;
const sensitiveQueryKey =
  /(?:api[_-]?key|access[_-]?token|token|secret|auth|signature|credential|password|cookie)/iu;
const sensitiveAssignment =
  /((["']?(?:api[_ -]?key|access[_ -]?token|token|secret|jwt|authorization|cookie|credential|password)["']?)\s*[=:]\s*)(?:["']?Bearer\s+)?[^\s,;]+/giu;
const bearerToken = /\bBearer\s+[^\s,;"']+/giu;

export type DiagnosticRecord = Record<string, unknown>;

export type DiagnosticsSnapshot = {
  files: Record<DiagnosticStream, string>;
  redactionCount: number;
  timeRange: { from: string | null; to: string | null };
};

export type DiagnosticLoggerOptions = {
  directory: string;
  maximumAgeMs?: number;
  maximumBytes?: number;
  now?: () => Date;
};

export type DiagnosticArchiveInput = {
  configurationSummary: DiagnosticRecord;
  manifest: DiagnosticRecord;
  readiness: DiagnosticRecord;
  snapshot: DiagnosticsSnapshot;
  targetPath: string;
};

function redactText(value: string): { count: number; value: string } {
  let count = 0;
  const replace = (expression: RegExp, input: string) =>
    input.replace(expression, (...matches: string[]) => {
      count += 1;
      return matches[1] ? `${matches[1]}${redacted}` : redacted;
    });

  let next = replace(sensitiveAssignment, value);
  next = replace(bearerToken, next);
  next = next.replace(/https?:\/\/[^\s"']+/giu, (candidate) => {
    try {
      const url = new URL(candidate);
      for (const key of [...url.searchParams.keys()]) {
        if (!sensitiveQueryKey.test(key)) continue;
        url.searchParams.set(key, redacted);
        count += 1;
      }
      return url.toString();
    } catch {
      return candidate;
    }
  });
  return { count, value: next };
}

export function redactDiagnosticValue(value: unknown): { count: number; value: unknown } {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) {
    return value.reduce<{ count: number; value: unknown[] }>(
      (result, item) => {
        const sanitized = redactDiagnosticValue(item);
        result.count += sanitized.count;
        result.value.push(sanitized.value);
        return result;
      },
      { count: 0, value: [] },
    );
  }
  if (!value || typeof value !== 'object') return { count: 0, value };

  return Object.entries(value as Record<string, unknown>).reduce<{
    count: number;
    value: Record<string, unknown>;
  }>(
    (result, [key, item]) => {
      if (sensitiveKey.test(key)) {
        result.count += 1;
        result.value[key] = redacted;
        return result;
      }
      const sanitized = redactDiagnosticValue(item);
      result.count += sanitized.count;
      result.value[key] = sanitized.value;
      return result;
    },
    { count: 0, value: {} },
  );
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isDiagnosticLogFile(name: string): boolean {
  return diagnosticStreams.some((stream) =>
    new RegExp(`^${stream}-\\d{4}-\\d{2}-\\d{2}\\.ndjson$`, 'u').test(name),
  );
}

export class DiagnosticLogger {
  readonly #directory: string;
  readonly #maximumAgeMs: number;
  readonly #maximumBytes: number;
  readonly #now: () => Date;
  #redactionCount = 0;
  #writeQueue = Promise.resolve();

  constructor(options: DiagnosticLoggerOptions) {
    this.#directory = options.directory;
    this.#maximumAgeMs = options.maximumAgeMs ?? 7 * 24 * 60 * 60 * 1_000;
    this.#maximumBytes = options.maximumBytes ?? 10 * 1024 * 1024;
    this.#now = options.now ?? (() => new Date());
  }

  append(stream: DiagnosticStream, record: DiagnosticRecord): Promise<void> {
    this.#writeQueue = this.#writeQueue.then(async () => {
      const now = this.#now();
      const sanitized = redactDiagnosticValue({ timestamp: now.toISOString(), ...record });
      this.#redactionCount += sanitized.count;
      await mkdir(this.#directory, { recursive: true });
      await appendFile(
        join(this.#directory, `${stream}-${dateKey(now)}.ndjson`),
        `${JSON.stringify(sanitized.value)}\n`,
        'utf8',
      );
      await this.#prune(now);
    });
    return this.#writeQueue;
  }

  async snapshot(): Promise<DiagnosticsSnapshot> {
    await this.#writeQueue;
    const files = Object.fromEntries(
      await Promise.all(
        diagnosticStreams.map(async (stream) => [stream, await this.#readStream(stream)] as const),
      ),
    ) as Record<DiagnosticStream, string>;
    const timestamps = Object.values(files)
      .flatMap((content) =>
        content
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              const parsed = JSON.parse(line) as { timestamp?: unknown };
              return typeof parsed.timestamp === 'string' ? parsed.timestamp : null;
            } catch {
              return null;
            }
          })
          .filter((timestamp): timestamp is string => timestamp !== null),
      )
      .sort();
    return {
      files,
      redactionCount: this.#redactionCount,
      timeRange: { from: timestamps[0] ?? null, to: timestamps.at(-1) ?? null },
    };
  }

  async #readStream(stream: DiagnosticStream): Promise<string> {
    try {
      const names = (await readdir(this.#directory))
        .filter((name) => name.startsWith(`${stream}-`) && isDiagnosticLogFile(name))
        .sort();
      const contents = await Promise.all(
        names.map(async (name) => readFile(join(this.#directory, name), 'utf8')),
      );
      return contents.join('');
    } catch {
      return '';
    }
  }

  async #prune(now: Date): Promise<void> {
    let entries: { path: string; modifiedMs: number; size: number }[];
    try {
      const names = (await readdir(this.#directory)).filter(isDiagnosticLogFile);
      entries = await Promise.all(
        names.map(async (name) => {
          const path = join(this.#directory, name);
          const details = await stat(path);
          return { path, modifiedMs: details.mtimeMs, size: details.size };
        }),
      );
    } catch {
      return;
    }

    const oldestAllowed = now.getTime() - this.#maximumAgeMs;
    for (const entry of entries.filter((entry) => entry.modifiedMs < oldestAllowed)) {
      await rm(entry.path, { force: true });
    }
    const retainedEntries = entries.filter((entry) => entry.modifiedMs >= oldestAllowed);
    let total = retainedEntries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of retainedEntries.sort((left, right) => left.modifiedMs - right.modifiedMs)) {
      if (total <= this.#maximumBytes) break;
      await rm(entry.path, { force: true });
      total -= entry.size;
    }
  }
}

export async function writeDiagnosticArchive(input: DiagnosticArchiveInput): Promise<void> {
  const temporaryPath = join(
    dirname(input.targetPath),
    `.${basename(input.targetPath)}.${randomUUID()}.partial`,
  );
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = createWriteStream(temporaryPath, { flags: 'wx' });
  const safeJson = (value: unknown) => JSON.stringify(redactDiagnosticValue(value).value, null, 2);
  const safeText = (value: string) => String(redactDiagnosticValue(value).value);

  try {
    await new Promise<void>((resolve, reject) => {
      output.once('close', resolve);
      output.once('error', reject);
      archive.once('error', reject);
      archive.pipe(output);
      archive.append(safeJson(input.manifest), { name: 'manifest.json' });
      archive.append(safeText(input.snapshot.files.main), { name: 'logs/main.ndjson' });
      archive.append(safeText(input.snapshot.files.worker), { name: 'logs/worker.ndjson' });
      archive.append(safeText(input.snapshot.files.conversation), { name: 'conversation.ndjson' });
      archive.append(safeText(input.snapshot.files['tool-events']), { name: 'tool-events.ndjson' });
      archive.append(safeJson(input.readiness), { name: 'readiness.json' });
      archive.append(safeJson(input.configurationSummary), {
        name: 'configuration-summary.json',
      });
      void archive.finalize();
    });
    await rename(temporaryPath, input.targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
