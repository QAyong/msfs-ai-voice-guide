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
  type ProcessWatchHandle,
} from './process-runner.js';

export type MsfsCliClientOptions = {
  executablePath: string;
  timeoutMs: number;
  maxConcurrency: number;
  runner?: MsfsProcessRunner;
  onDiagnostic?: (event: MsfsCliDiagnostic) => void;
};

export type MsfsCliDiagnostic = {
  kind: 'executable_missing' | 'spawn_failed' | 'timeout' | 'protocol_error' | 'command_error';
  operation: string;
  exitCode?: number | null;
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
  }

  async execute<T>(
    args: readonly string[],
    dataSchema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<MsfsCommandResult<T>> {
    return this.gate.run(async () => {
      const first = await this.executeOnce(args, dataSchema, signal);
      if (first.status !== 'unavailable' || !retryableCodes.has(first.code) || signal?.aborted) {
        return first;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      if (signal?.aborted) return first;
      return this.executeOnce(args, dataSchema, signal);
    });
  }

  private async executeOnce<T>(
    args: readonly string[],
    dataSchema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<MsfsCommandResult<T>> {
    const operation = args.slice(0, 2).join('.');
    try {
      await access(this.options.executablePath, constants.X_OK);
    } catch {
      this.options.onDiagnostic?.({ kind: 'executable_missing', operation });
      return unavailable('MSFS_CLI_UNAVAILABLE');
    }

    let result;
    try {
      result = await this.runner.run(this.options.executablePath, [...args, '--json'], {
        timeoutMs: this.options.timeoutMs,
        maxOutputBytes: 1_000_000,
        ...(signal ? { signal } : {}),
      });
    } catch {
      this.options.onDiagnostic?.({ kind: 'spawn_failed', operation });
      return unavailable('MSFS_CLI_UNAVAILABLE');
    }

    if (result.timedOut) {
      this.options.onDiagnostic?.({ kind: 'timeout', operation, exitCode: result.exitCode });
      return unavailable('MSFS_CLI_TIMEOUT');
    }
    const envelope = this.parseEnvelope(result.stdout);
    if (!envelope) {
      this.options.onDiagnostic?.({
        kind: 'protocol_error',
        operation,
        exitCode: result.exitCode,
      });
      return unavailable('MSFS_CLI_PROTOCOL_ERROR');
    }
    if (!envelope.ok) {
      const code = normalizedCode(envelope.error.code);
      this.options.onDiagnostic?.({
        kind: 'command_error',
        operation,
        exitCode: result.exitCode,
        code: envelope.error.code,
      });
      return unavailable(code, envelope.id);
    }

    const data = dataSchema.safeParse(envelope.data);
    if (!data.success) {
      this.options.onDiagnostic?.({
        kind: 'protocol_error',
        operation,
        exitCode: result.exitCode,
      });
      return unavailable('MSFS_CLI_PROTOCOL_ERROR', envelope.id);
    }
    return { status: 'ok', requestId: envelope.id, data: data.data };
  }

  watch(
    args: readonly string[],
    onEnvelope: (envelope: MsfsCliEnvelope) => void,
    onError: (error: unknown) => void,
  ): ProcessWatchHandle {
    return this.runner.watch(this.options.executablePath, [...args, '--json'], {
      onLine: (line) => {
        const envelope = this.parseEnvelope(line);
        if (envelope) onEnvelope(envelope);
        else onError(new Error('MSFS CLI NDJSON protocol error'));
      },
      onError,
    });
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
