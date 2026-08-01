import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createSocket } from 'node:dgram';

const loopbackAddress = '127.0.0.1';
const stateFileName = 'runtime-state.json';
const configFileName = 'livekit.yaml';
const stopTimeoutMs = 5_000;

export type LocalLiveKitRuntimeState = {
  apiKey: string;
  apiSecret: string;
  signalPort: number;
  rtcTcpPort: number;
  rtcUdpPort: number;
};

export type LocalLiveKitConnection = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export type LocalLiveKitRuntimeOptions = {
  executablePath: string;
  runtimeDirectory: string;
};

const falseValues = new Set(['0', 'false', 'no', 'off']);

export function shouldAutoStartLocalLiveKit(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.MSFS_AUTO_START_LIVEKIT?.trim().toLowerCase();
  return value === undefined || !falseValues.has(value);
}

export function getLocalLiveKitServerPath(options: {
  isPackaged: boolean;
  resourcesPath: string;
  projectRoot: string;
}): string {
  return options.isPackaged
    ? join(options.resourcesPath, 'livekit', 'livekit-server.exe')
    : join(options.projectRoot, 'resources', 'livekit', 'livekit-server.exe');
}

export function createLocalLiveKitConfig(state: LocalLiveKitRuntimeState): string {
  return [
    `port: ${state.signalPort}`,
    'rtc:',
    `  udp_port: ${state.rtcUdpPort}`,
    `  tcp_port: ${state.rtcTcpPort}`,
    '  use_external_ip: false',
    `  node_ip: ${loopbackAddress}`,
    'keys:',
    `  ${state.apiKey}: ${state.apiSecret}`,
    'logging:',
    '  level: warn',
    '',
  ].join('\n');
}

export function createLocalLiveKitConnection(
  state: LocalLiveKitRuntimeState,
): LocalLiveKitConnection {
  return {
    url: `ws://${loopbackAddress}:${state.signalPort}`,
    apiKey: state.apiKey,
    apiSecret: state.apiSecret,
  };
}

export function applyLocalLiveKitEnvironment(
  environment: NodeJS.ProcessEnv,
  connection: LocalLiveKitConnection,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    LIVEKIT_URL: connection.url,
    LIVEKIT_API_KEY: connection.apiKey,
    LIVEKIT_API_SECRET: connection.apiSecret,
  };
}

const isValidPort = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1_024 && value <= 65_535;

const isRuntimeState = (value: unknown): value is LocalLiveKitRuntimeState => {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<LocalLiveKitRuntimeState>;
  return (
    typeof state.apiKey === 'string' &&
    /^[A-Za-z0-9_-]{12,}$/u.test(state.apiKey) &&
    typeof state.apiSecret === 'string' &&
    /^[A-Za-z0-9_-]{32,}$/u.test(state.apiSecret) &&
    isValidPort(state.signalPort) &&
    isValidPort(state.rtcTcpPort) &&
    isValidPort(state.rtcUdpPort)
  );
};

const randomLocalCredential = (bytes: number) => randomBytes(bytes).toString('base64url');

const allocateTcpPort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ host: loopbackAddress, port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('无法分配本地 TCP 端口。'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const allocateUdpPort = () =>
  new Promise<number>((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', reject);
    socket.bind({ address: loopbackAddress, port: 0 }, () => {
      const address = socket.address();
      socket.close();
      resolve(address.port);
    });
  });

const allocateDistinctPorts = async () => {
  const ports = new Set<number>();
  while (ports.size < 2) ports.add(await allocateTcpPort());
  while (ports.size < 3) ports.add(await allocateUdpPort());
  const [signalPort, rtcTcpPort, rtcUdpPort] = [...ports];
  if (signalPort === undefined || rtcTcpPort === undefined || rtcUdpPort === undefined) {
    throw new Error('无法分配本地 LiveKit 端口。');
  }
  return { signalPort, rtcTcpPort, rtcUdpPort };
};

const createRuntimeState = async (): Promise<LocalLiveKitRuntimeState> => ({
  apiKey: `msfs_${randomLocalCredential(12)}`,
  apiSecret: randomLocalCredential(32),
  ...(await allocateDistinctPorts()),
});

const waitForTcpPort = (port: number, timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = createConnection({ host: loopbackAddress, port });
      const finish = (ready: boolean) => {
        socket.destroy();
        resolve(ready);
      };
      socket.setTimeout(250);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => {
        if (Date.now() >= deadline) finish(false);
        else setTimeout(attempt, 100);
      });
      socket.once('error', () => {
        if (Date.now() >= deadline) finish(false);
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });

export class LocalLiveKitRuntime {
  private child: ChildProcessWithoutNullStreams | null = null;
  private state: LocalLiveKitRuntimeState | null = null;
  private fingerprint = '';
  private stopping = false;
  private output = '';

  async ensureStarted(options: LocalLiveKitRuntimeOptions): Promise<LocalLiveKitConnection> {
    const fingerprint = JSON.stringify(options);
    if (this.child && this.state && this.fingerprint === fingerprint && !this.child.killed) {
      return createLocalLiveKitConnection(this.state);
    }
    await this.stop();
    if (!existsSync(options.executablePath)) {
      throw new Error('未找到本地 LiveKit Server。请检查应用安装资源是否完整。');
    }

    this.fingerprint = fingerprint;
    this.stopping = false;
    this.state = await this.readOrCreateState(options.runtimeDirectory);
    try {
      await this.start(options, this.state);
    } catch (error) {
      if (!/address already in use|only one usage/iu.test(this.output)) throw error;
      this.state = { ...this.state, ...(await allocateDistinctPorts()) };
      this.writeState(options.runtimeDirectory, this.state);
      await this.start(options, this.state);
    }
    return createLocalLiveKitConnection(this.state);
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.stopping = true;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), stopTimeoutMs)),
    ]);
    if (!graceful && child.exitCode === null) child.kill('SIGKILL');
  }

  private async start(options: LocalLiveKitRuntimeOptions, state: LocalLiveKitRuntimeState) {
    this.output = '';
    this.writeConfig(options.runtimeDirectory, state);
    const configPath = join(options.runtimeDirectory, configFileName);
    const child = spawn(
      options.executablePath,
      ['--config', configPath, '--bind', loopbackAddress],
      {
        cwd: options.runtimeDirectory,
        windowsHide: true,
        stdio: 'pipe',
      },
    );
    this.child = child;
    const captureOutput = (chunk: Uint8Array | string) => {
      this.output = `${this.output}${String(chunk)}`.slice(-2_000);
    };
    child.stdout.on('data', captureOutput);
    child.stderr.on('data', captureOutput);
    child.once('error', captureOutput);

    const started = await waitForTcpPort(state.signalPort, 8_000);
    if (started && child.exitCode === null) return;
    this.child = null;
    if (child.exitCode === null) child.kill();
    throw new Error(this.output.trim() || '本地 LiveKit Server 未能启动。');
  }

  private async readOrCreateState(runtimeDirectory: string): Promise<LocalLiveKitRuntimeState> {
    mkdirSync(runtimeDirectory, { recursive: true });
    const statePath = join(runtimeDirectory, stateFileName);
    try {
      const parsed: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
      if (isRuntimeState(parsed)) return parsed;
    } catch {
      // The state is recreated below when it is missing or malformed.
    }
    const state = await createRuntimeState();
    this.writeState(runtimeDirectory, state);
    return state;
  }

  private writeState(runtimeDirectory: string, state: LocalLiveKitRuntimeState) {
    writeFileSync(join(runtimeDirectory, stateFileName), `${JSON.stringify(state)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  private writeConfig(runtimeDirectory: string, state: LocalLiveKitRuntimeState) {
    writeFileSync(join(runtimeDirectory, configFileName), createLocalLiveKitConfig(state), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
