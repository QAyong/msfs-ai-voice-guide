import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { statusDataSchema, systemStateDataSchema } from '../../src/msfs/schemas.js';
import type { MsfsCommandResult } from '../../src/msfs/types.js';
import { z } from 'zod';
import {
  msfsConnectionStatusSchema,
  type MsfsConnectionStatus,
} from '../../shared/msfs-desktop.js';

export type MsfsConnectionMonitorOptions = {
  client: MsfsCliClient;
  isVisible: () => boolean;
  onStatus: (status: MsfsConnectionStatus) => void;
  onDiagnostic?: (event: MsfsConnectionDiagnostic) => void;
  intervalMs?: number;
};

export type MsfsConnectionDiagnostic = {
  kind: 'probe' | 'refresh';
  operation?: 'status' | 'system.state';
  durationMs?: number;
  status?: 'ok' | 'unavailable';
  code?: string;
  requestId?: string;
  visible?: boolean;
  connected?: boolean;
  statusCode?: string;
  simulatorStateCode?: string;
};

export class MsfsConnectionMonitor {
  private timer: NodeJS.Timeout | null = null;
  private checking = false;
  private lastStatus: MsfsConnectionStatus | null = null;

  constructor(private readonly options: MsfsConnectionMonitorOptions) {}

  start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.options.intervalMs ?? 5_000);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async probe<T>(
    operation: 'status' | 'system.state',
    args: readonly string[],
    schema: z.ZodType<T>,
  ): Promise<MsfsCommandResult<T>> {
    const startedAt = Date.now();
    const result = await this.options.client.execute(args, schema);
    this.options.onDiagnostic?.({
      kind: 'probe',
      operation,
      durationMs: Math.max(0, Date.now() - startedAt),
      status: result.status,
      ...(result.status === 'unavailable'
        ? { code: result.code }
        : { requestId: result.requestId }),
    });
    return result;
  }

  async refresh(): Promise<MsfsConnectionStatus> {
    if (this.checking) {
      return (
        this.lastStatus ??
        msfsConnectionStatusSchema.parse({
          visible: this.options.isVisible(),
          connected: false,
          message: '正在检测 MSFS 游戏连接。',
          timestamp: new Date().toISOString(),
        })
      );
    }
    this.checking = true;
    try {
      const visible = this.options.isVisible();
      const result = visible ? await this.probe('status', ['status'], statusDataSchema) : null;
      const simulatorState = visible
        ? await this.probe(
            'system.state',
            ['system', 'state', '--name', 'AircraftLoaded'],
            systemStateDataSchema,
          )
        : null;
      const connected =
        (result?.status === 'ok' && result.data.simconnect.connected) ||
        simulatorState?.status === 'ok';
      const status = msfsConnectionStatusSchema.parse({
        visible,
        connected,
        message: !visible
          ? 'MSFS 工具已关闭。'
          : connected
            ? 'MSFS 游戏已连接。'
            : 'MSFS 游戏未连接。',
        timestamp: new Date().toISOString(),
      });
      this.options.onDiagnostic?.({
        kind: 'refresh',
        visible,
        connected,
        ...(result?.status === 'unavailable' ? { statusCode: result.code } : {}),
        ...(simulatorState?.status === 'unavailable'
          ? { simulatorStateCode: simulatorState.code }
          : {}),
      });
      this.lastStatus = status;
      this.options.onStatus(status);
      return status;
    } finally {
      this.checking = false;
    }
  }
}
