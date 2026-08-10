import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { z } from 'zod';
import {
  msfsCliEnvelopeSchema,
  msfsUnavailableCodeSchema,
  type MsfsCliEnvelope,
  type MsfsCommandResult,
  type MsfsUnavailable,
  type MsfsUnavailableCode,
} from './types.js';
import {
  NodeMsfsProcessRunner,
  type MsfsProcessRunner,
  type ProcessRunResult,
  type ProcessWatchHandle,
} from './process-runner.js';

export type MsfsDaemonRole = 'monitor' | 'ai';

export type MsfsCliClientOptions = {
  executablePath: string;
  timeoutMs: number;
  maxConcurrency: number;
  role?: MsfsDaemonRole;
  runner?: MsfsProcessRunner;
  onDiagnostic?: (event: MsfsCliDiagnostic) => void;
};

export type MsfsCliDiagnostic = {
  kind:
    | 'runtime'
    | 'request_start'
    | 'request_end'
    | 'executable_missing'
    | 'spawn_failed'
    | 'timeout'
    | 'protocol_error'
    | 'command_error'
    | 'watch_start'
    | 'watch_event'
    | 'watch_error'
    | 'watch_exit';
  operation: string;
  role?: MsfsDaemonRole;
  attempt?: number;
  queueWaitMs?: number;
  durationMs?: number;
  outcome?: 'ok' | 'unavailable';
  pid?: number | null;
  requestId?: string;
  executablePath?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  code?: string;
};

const publicMessages: Record<MsfsUnavailableCode, string> = {
  SIM_NOT_READY: '模拟器尚未进入已加载飞行的座舱。',
  SIM_POSITION_UNAVAILABLE: '当前无法从模拟器读取飞机位置。',
  ROUTE_BRIDGE_UNAVAILABLE: 'EFB 航路桥接模块尚未可用，请检查 Community Package。',
  ROUTE_TIMEOUT: 'EFB 航路桥接模块没有及时响应。',
  ROUTE_NOT_FOUND: '尚未在 EFB 中设置可读取的航路。',
  ROUTE_BRIDGE_VERSION_MISMATCH: 'EFB 航路桥接模块版本与当前应用不兼容。',
  EXTERNAL_GEO_CONFIG_INVALID: '外部地理服务尚未完成配置。',
  EXTERNAL_GEO_AUTH_FAILED: '外部地理服务认证失败。',
  EXTERNAL_GEO_UNAVAILABLE: '外部地理服务暂时不可用。',
  EXTERNAL_GEO_BACKEND_UNAVAILABLE: '外部地理服务后端暂时不可用。',
  TRACK_HISTORY_EMPTY: '本次会话尚未积累可用的飞行轨迹。',
  MSFS_CLI_UNAVAILABLE: 'MSFS CLI 暂时不可用。',
  MSFS_CLI_TIMEOUT: 'MSFS CLI 响应超时。',
  MSFS_CLI_PROTOCOL_ERROR: 'MSFS CLI 返回了无法识别的数据。',
};

const normalizedCode = (code: string): MsfsUnavailableCode => {
  const parsed = msfsUnavailableCodeSchema.safeParse(code);
  if (parsed.success) return parsed.data;
  if (code === 'DAEMON_UNAVAILABLE') return 'MSFS_CLI_UNAVAILABLE';
  return 'MSFS_CLI_UNAVAILABLE';
};

const unavailable = (code: MsfsUnavailableCode, requestId?: string): MsfsUnavailable => ({
  status: 'unavailable',
  code,
  message: publicMessages[code],
  source: 'msfs_cli',
  ...(requestId ? { requestId } : {}),
  timestamp: new Date().toISOString(),
});

const retryableCodes = new Set<MsfsUnavailableCode>(['MSFS_CLI_UNAVAILABLE', 'MSFS_CLI_TIMEOUT']);

const retryDelayMs = 1_000;

class ConcurrencyGate {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

export class MsfsCliClient {
  private readonly runner: MsfsProcessRunner;
  private readonly gate: ConcurrencyGate;

  constructor(private readonly options: MsfsCliClientOptions) {
    this.runner = options.runner ?? new NodeMsfsProcessRunner();
    this.gate = new ConcurrencyGate(options.maxConcurrency);
    this.emitDiagnostic({
      kind: 'runtime',
      operation: 'client',
      role: options.role ?? 'ai',
      executablePath: options.executablePath,
      timeoutMs: options.timeoutMs,
      maxConcurrency: options.maxConcurrency,
    });
  }

  async execute<T>(
    args: readonly string[],
    dataSchema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<MsfsCommandResult<T>> {
    const queuedAt = Date.now();
    return this.gate.run(async () => {
      const queueWaitMs = Math.max(0, Date.now() - queuedAt);
      const first = await this.executeOnce(args, dataSchema, signal, 1, queueWaitMs);
      if (first.status !== 'unavailable' || !retryableCodes.has(first.code) || signal?.aborted) {
        return first;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      if (signal?.aborted) return first;
      return this.executeOnce(args, dataSchema, signal, 2, queueWaitMs);
    });
  }

  private async executeOnce<T>(
    args: readonly string[],
    dataSchema: z.ZodType<T>,
    signal?: AbortSignal,
    attempt = 1,
    queueWaitMs = 0,
  ): Promise<MsfsCommandResult<T>> {
    const operation = args.slice(0, 2).join('.') || args[0] || 'unknown';
    const startedAt = Date.now();
    let runnerResult: ProcessRunResult | undefined;
    let outcome: 'ok' | 'unavailable' = 'unavailable';
    let code: string | undefined;
    let requestId: string | undefined;
    const fail = (failureCode: MsfsUnavailableCode, id?: string) => {
      code = failureCode;
      requestId = id;
      return unavailable(failureCode, id);
    };

    this.emitDiagnostic({ kind: 'request_start', operation, attempt, queueWaitMs });
    try {
      try {
        await access(this.options.executablePath, constants.X_OK);
      } catch {
        this.emitDiagnostic({ kind: 'executable_missing', operation, attempt, queueWaitMs });
        return fail('MSFS_CLI_UNAVAILABLE');
      }

      try {
        runnerResult = await this.runner.run(this.options.executablePath, this.cliArgs(args), {
          timeoutMs: this.options.timeoutMs,
          maxOutputBytes: 1_000_000,
          ...(signal ? { signal } : {}),
        });
      } catch {
        this.emitDiagnostic({ kind: 'spawn_failed', operation, attempt, queueWaitMs });
        return fail('MSFS_CLI_UNAVAILABLE');
      }

      if (runnerResult.timedOut) {
        this.emitDiagnostic({
          kind: 'timeout',
          operation,
          attempt,
          queueWaitMs,
          ...(runnerResult.pid === undefined ? {} : { pid: runnerResult.pid }),
          exitCode: runnerResult.exitCode,
        });
        return fail('MSFS_CLI_TIMEOUT');
      }
      const envelope = this.parseEnvelope(runnerResult.stdout);
      if (!envelope) {
        this.emitDiagnostic({
          kind: 'protocol_error',
          operation,
          attempt,
          queueWaitMs,
          ...(runnerResult.pid === undefined ? {} : { pid: runnerResult.pid }),
          exitCode: runnerResult.exitCode,
        });
        return fail('MSFS_CLI_PROTOCOL_ERROR');
      }
      requestId = envelope.id;
      if (!envelope.ok) {
        const normalized = normalizedCode(envelope.error.code);
        this.emitDiagnostic({
          kind: 'command_error',
          operation,
          attempt,
          queueWaitMs,
          ...(runnerResult.pid === undefined ? {} : { pid: runnerResult.pid }),
          exitCode: runnerResult.exitCode,
          code: envelope.error.code,
          requestId: envelope.id,
        });
        return fail(normalized, envelope.id);
      }

      const data = dataSchema.safeParse(envelope.data);
      if (!data.success) {
        this.emitDiagnostic({
          kind: 'protocol_error',
          operation,
          attempt,
          queueWaitMs,
          ...(runnerResult.pid === undefined ? {} : { pid: runnerResult.pid }),
          exitCode: runnerResult.exitCode,
          requestId: envelope.id,
        });
        return fail('MSFS_CLI_PROTOCOL_ERROR', envelope.id);
      }
      outcome = 'ok';
      return { status: 'ok', requestId: envelope.id, data: data.data };
    } finally {
      this.emitDiagnostic({
        kind: 'request_end',
        operation,
        attempt,
        queueWaitMs,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome,
        ...(runnerResult && runnerResult.pid !== undefined ? { pid: runnerResult.pid } : {}),
        ...(runnerResult ? { exitCode: runnerResult.exitCode } : {}),
        ...(runnerResult?.timedOut ? { timedOut: true } : {}),
        ...(code ? { code } : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
  }

  watch(
    args: readonly string[],
    onEnvelope: (envelope: MsfsCliEnvelope) => void,
    onError: (error: unknown) => void,
  ): ProcessWatchHandle {
    const operation = args.slice(0, 2).join('.') || args[0] || 'watch';
    let processId: number | null | undefined;
    let handle: ProcessWatchHandle;
    try {
      handle = this.runner.watch(this.options.executablePath, this.cliArgs(args), {
        onLine: (line) => {
          const envelope = this.parseEnvelope(line);
          if (envelope) {
            this.emitDiagnostic({
              kind: 'watch_event',
              operation,
              ...(processId === undefined ? {} : { pid: processId }),
              requestId: envelope.id,
            });
            onEnvelope(envelope);
          } else {
            const error = new Error('MSFS CLI NDJSON protocol error');
            this.emitDiagnostic({
              kind: 'watch_error',
              operation,
              ...(processId === undefined ? {} : { pid: processId }),
            });
            onError(error);
          }
        },
        onError: (error) => {
          this.emitDiagnostic({
            kind: 'watch_error',
            operation,
            ...(processId === undefined ? {} : { pid: processId }),
          });
          onError(error);
        },
        onClose: (exitCode) => {
          this.emitDiagnostic({
            kind: 'watch_exit',
            operation,
            ...(processId === undefined ? {} : { pid: processId }),
            exitCode,
          });
        },
      });
    } catch (error) {
      this.emitDiagnostic({ kind: 'watch_error', operation });
      throw error;
    }
    processId = handle.pid;
    this.emitDiagnostic({
      kind: 'watch_start',
      operation,
      ...(processId === undefined ? {} : { pid: processId }),
    });
    return handle;
  }

  private emitDiagnostic(event: MsfsCliDiagnostic): void {
    try {
      this.options.onDiagnostic?.({ role: this.options.role ?? 'ai', ...event });
    } catch {
      // Diagnostics must never change the MSFS request result.
    }
  }

  private cliArgs(args: readonly string[]): string[] {
    return [...args, '--role', this.options.role ?? 'ai', '--json'];
  }

  private parseEnvelope(stdout: string): MsfsCliEnvelope | null {
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    try {
      const parsed = msfsCliEnvelopeSchema.safeParse(JSON.parse(trimmed));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
