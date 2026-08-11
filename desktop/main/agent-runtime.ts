import { utilityProcess, type UtilityProcess } from 'electron';
import type { AppConfig } from '../../src/config/schema.js';
import type { DesktopReadiness } from '../../shared/desktop-contracts.js';
import { localizeDesktopText, type DesktopLocale } from '../../shared/desktop-locale.js';
import { workerFailureReadiness } from './readiness.js';

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
    this.locale = locale;
    const fingerprint = JSON.stringify([config, agentProcessPath, locale, this.healthPort]);
    if (this.child && this.fingerprint === fingerprint && this.status !== 'error') return;
    if (this.child) await this.stop();

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
      if (this.stopping) return;
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
