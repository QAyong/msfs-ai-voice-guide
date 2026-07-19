import { utilityProcess, type UtilityProcess } from 'electron';
import type { AppConfig } from '../../src/config/schema.js';
import type { DesktopReadiness } from '../../shared/desktop-contracts.js';
import { workerFailureReadiness } from './readiness.js';

const healthUrl = 'http://127.0.0.1:8098/';

type RuntimeStatus = 'stopped' | 'starting' | 'ready' | 'error';
type AgentProcessMessage =
  { type: 'error'; message: string } | { type: 'stopped' } | { type: 'started' };

export class EmbeddedAgentRuntime {
  private child: UtilityProcess | null = null;
  private status: RuntimeStatus = 'stopped';
  private error: unknown = null;
  private fingerprint = '';
  private stopping = false;

  getReadiness(): DesktopReadiness {
    if (this.status === 'ready') {
      return { status: 'ready', message: 'AI 服务已就绪。', issues: [] };
    }
    if (this.status === 'error') return workerFailureReadiness(this.error);
    return {
      status: this.status === 'starting' ? 'worker_starting' : 'checking',
      message: this.status === 'starting' ? '正在启动 AI 服务…' : '正在检查 AI 服务…',
      issues: [],
    };
  }

  async ensureStarted(config: AppConfig, agentProcessPath: string): Promise<void> {
    const fingerprint = JSON.stringify([config, agentProcessPath]);
    if (this.child && this.fingerprint === fingerprint && this.status !== 'error') return;
    if (this.child) await this.stop();

    this.fingerprint = fingerprint;
    this.status = 'starting';
    this.error = null;
    this.stopping = false;

    const child = utilityProcess.fork(agentProcessPath, [], {
      cwd: process.cwd(),
      serviceName: 'MSFS AI Guide Agent',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    let childErrorOutput = '';
    const captureChildOutput = (chunk: Uint8Array | string) => {
      childErrorOutput = `${childErrorOutput}${String(chunk)}`.slice(-2_000).trim();
    };
    child.stdout?.resume();
    child.stderr?.on('data', captureChildOutput);

    child.on('message', (message: AgentProcessMessage) => {
      if (this.child !== child) return;
      if (message?.type === 'error') {
        this.status = 'error';
        this.error = new Error(message.message);
      }
    });
    child.on('error', (type, location) => {
      if (this.child !== child) return;
      this.status = 'error';
      this.error = new Error(`${type}: ${location}`);
    });
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.stopping) return;
      if (this.status === 'error') return;
      this.status = 'error';
      this.error = new Error(childErrorOutput || `AI Worker 已退出（代码 ${code}）`);
    });
  }

  async waitUntilReady(timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastFailure = '';
    while (Date.now() < deadline) {
      if (this.status === 'error') return false;
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          this.status = 'ready';
          return true;
        }
        const detail = (await response.text()).trim();
        lastFailure = detail.includes('not connected to livekit')
          ? 'LiveKit 服务不可用，或 Worker 尚未完成注册。请确认 LiveKit Server 已启动。'
          : `AI Worker 健康检查未通过（HTTP ${response.status}）。`;
      } catch {
        lastFailure = 'AI Worker 健康检查端口尚未就绪。';
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.status = 'error';
    this.error = new Error(lastFailure || '等待 LiveKit Worker 就绪超时');
    return false;
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.stopping = true;
    this.status = 'stopped';
    this.error = null;
    if (!child) return;

    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    try {
      child.postMessage({ type: 'shutdown' });
    } catch {
      child.kill();
    }
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 5_000)),
    ]);
    if (!graceful) child.kill();
  }
}
