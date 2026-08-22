import { utilityProcess, type UtilityProcess } from 'electron';
import type { AppConfig } from '../../src/config/schema.js';
import type { DesktopReadiness } from '../../shared/desktop-contracts.js';
import { localizeDesktopText, type DesktopLocale } from '../../shared/desktop-locale.js';
import { workerFailureReadiness } from './readiness.js';
import { SerialTaskQueue } from './serial-task-queue.js';

type RuntimeStatus = 'stopped' | 'starting' | 'ready' | 'error';
type AgentProcessMessage =
  { type: 'error'; message: string } | { type: 'stopped' } | { type: 'started' };

export class EmbeddedAgentRuntime {
  private child: UtilityProcess | null = null;
  private status: RuntimeStatus = 'stopped';
  private error: unknown = null;
  private fingerprint = '';
  private stopping = false;
  private locale: DesktopLocale = 'zh-CN';
  private readonly lifecycle = new SerialTaskQueue();

  constructor(
    private readonly healthPort = 8098,
    private readonly onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void,
  ) {}

  private get healthUrl() {
    return `http://127.0.0.1:${this.healthPort}/`;
  }

  getReadiness(): DesktopReadiness {
    if (this.status === 'ready') {
      return {
        status: 'ready',
        message: localizeDesktopText(this.locale, 'AI service is ready.', 'AI 服务已就绪。'),
        issues: [],
      };
    }
    if (this.status === 'error') return workerFailureReadiness(this.error, this.locale);
    return {
      status: this.status === 'starting' ? 'worker_starting' : 'checking',
      message:
        this.status === 'starting'
          ? localizeDesktopText(this.locale, 'Starting the AI service…', '正在启动 AI 服务…')
          : localizeDesktopText(this.locale, 'Checking the AI service…', '正在检查 AI 服务…'),
      issues: [],
    };
  }

  async ensureStarted(
    config: AppConfig,
    agentProcessPath: string,
    locale: 'en-US' | 'zh-CN',
    environment: NodeJS.ProcessEnv = process.env,
  ): Promise<void> {
    return this.lifecycle.run(() =>
      this.ensureStartedInternal(config, agentProcessPath, locale, environment),
    );
  }

  private async ensureStartedInternal(
    config: AppConfig,
    agentProcessPath: string,
    locale: 'en-US' | 'zh-CN',
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    this.locale = locale;
    const fingerprint = JSON.stringify([config, agentProcessPath, locale, this.healthPort]);
    if (this.child && this.fingerprint === fingerprint && this.status !== 'error') return;
    if (this.child) await this.stopInternal();

    this.fingerprint = fingerprint;
    this.status = 'starting';
    this.error = null;
    this.stopping = false;

    const child = utilityProcess.fork(agentProcessPath, [], {
      cwd: process.cwd(),
      env: {
        ...environment,
        AGENT_HEALTH_PORT: String(this.healthPort),
        GUIDE_LOCALE: locale,
      },
      serviceName: 'MSFS AI Guide Agent',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    let childErrorOutput = '';
    const captureChildOutput = (stream: 'stdout' | 'stderr') => (chunk: Uint8Array | string) => {
      const text = String(chunk);
      if (stream === 'stderr') childErrorOutput = `${childErrorOutput}${text}`.slice(-2_000).trim();
      this.onOutput?.(stream, text);
    };
    child.stdout?.on('data', captureChildOutput('stdout'));
    child.stderr?.on('data', captureChildOutput('stderr'));

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
      if (this.stopping) {
        this.status = 'stopped';
        this.error = null;
        return;
      }
      if (this.status === 'error') return;
      this.status = 'error';
      this.error = new Error(
        childErrorOutput ||
          localizeDesktopText(
            this.locale,
            `The AI worker exited (code ${code}).`,
            `AI Worker 已退出（代码 ${code}）`,
          ),
      );
    });
  }

  async waitUntilReady(timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastFailure = '';
    while (Date.now() < deadline) {
      if (this.status === 'error') return false;
      try {
        const response = await fetch(this.healthUrl, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          this.status = 'ready';
          return true;
        }
        const detail = (await response.text()).trim();
        lastFailure = detail.includes('not connected to livekit')
          ? localizeDesktopText(
              this.locale,
              'LiveKit is unavailable or the worker has not registered. Confirm that the LiveKit server is running.',
              'LiveKit 服务不可用，或 Worker 尚未完成注册。请确认 LiveKit Server 已启动。',
            )
          : localizeDesktopText(
              this.locale,
              `AI worker health check failed (HTTP ${response.status}).`,
              `AI Worker 健康检查未通过（HTTP ${response.status}）。`,
            );
      } catch {
        lastFailure = localizeDesktopText(
          this.locale,
          'The AI worker health-check port is not ready.',
          'AI Worker 健康检查端口尚未就绪。',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    this.status = 'error';
    this.error = new Error(
      lastFailure ||
        localizeDesktopText(
          this.locale,
          'Timed out waiting for the LiveKit worker to become ready.',
          '等待 LiveKit Worker 就绪超时',
        ),
    );
    return false;
  }

  async stop(): Promise<void> {
    return this.lifecycle.run(() => this.stopInternal());
  }

  private async stopInternal(): Promise<void> {
    const child = this.child;
    this.stopping = true;
    this.status = 'stopped';
    this.error = null;
    if (!child) {
      this.stopping = false;
      return;
    }

    const exited = this.waitForExit(child, 5_000);
    try {
      child.postMessage({ type: 'shutdown' });
    } catch {
      child.kill();
    }
    if (!(await exited)) {
      child.kill();
      if (!(await this.waitForExit(child, 5_000))) {
        this.status = 'error';
        this.error = new Error('AI Worker 未能在重启前退出。');
        this.stopping = false;
        throw this.error;
      }
    }
    this.stopping = false;
  }

  private waitForExit(child: UtilityProcess, timeoutMs: number): Promise<boolean> {
    if (this.child !== child) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => finish(false), timeoutMs);
      const finish = (exited: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(exited);
      };
      child.once('exit', () => finish(true));
    });
  }
}
