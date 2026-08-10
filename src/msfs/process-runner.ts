import { spawn } from 'node:child_process';

export type ProcessRunOptions = {
  signal?: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type ProcessRunResult = {
  pid?: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type WatchCallbacks = {
  onLine(line: string): void;
  onError(error: unknown): void;
  onClose?(exitCode: number | null): void;
};

export interface ProcessWatchHandle {
  pid?: number | null;
  stop(): Promise<void>;
  completion: Promise<void>;
}

export interface MsfsProcessRunner {
  run(
    executable: string,
    args: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessRunResult>;
  watch(executable: string, args: readonly string[], callbacks: WatchCallbacks): ProcessWatchHandle;
}

const killProcess = (child: ReturnType<typeof spawn>) => {
  if (!child.killed) child.kill();
};

export class NodeMsfsProcessRunner implements MsfsProcessRunner {
  run(
    executable: string,
    args: readonly string[],
    options: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const finish = (result: ProcessRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        resolve(result);
      };
      const append = (current: string, chunk: Buffer) =>
        `${current}${chunk.toString('utf8')}`.slice(-options.maxOutputBytes);
      const abort = () => killProcess(child);
      const timer = setTimeout(() => {
        timedOut = true;
        killProcess(child);
      }, options.timeoutMs);

      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        reject(error);
      });
      child.once('close', (exitCode) =>
        finish({ pid: child.pid ?? null, exitCode, stdout, stderr, timedOut }),
      );
    });
  }

  watch(
    executable: string,
    args: readonly string[],
    callbacks: WatchCallbacks,
  ): ProcessWatchHandle {
    const child = spawn(executable, [...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stopped = false;
    let resolveCompletion: () => void = () => undefined;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 1_000_000) {
        callbacks.onError(new Error('MSFS CLI NDJSON line exceeded the safe limit'));
        buffer = '';
        killProcess(child);
        return;
      }
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) callbacks.onLine(line);
      }
    });
    child.once('error', callbacks.onError);
    child.once('close', (exitCode) => {
      if (buffer.trim()) callbacks.onLine(buffer);
      callbacks.onClose?.(exitCode);
      resolveCompletion();
    });

    return {
      pid: child.pid ?? null,
      completion,
      stop: async () => {
        if (stopped) return completion;
        stopped = true;
        killProcess(child);
        return completion;
      },
    };
  }
}
