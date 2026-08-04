import { AgentServer, ServerOptions, initializeLogger } from '@livekit/agents';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/schema.js';

// AgentServer forks job executors. Electron's executable must run those grandchildren
// in Node mode instead of attempting to open another desktop window.
process.env.ELECTRON_RUN_AS_NODE = '1';
const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
if (!process.env.MSFS_CLI_PATH) {
  const packagedCliPath = resourcesPath ? join(resourcesPath, 'msfs', 'msfs.exe') : undefined;
  const developmentCliPath = join(process.cwd(), 'resources', 'msfs', 'msfs.exe');
  const cliPath =
    (packagedCliPath && existsSync(packagedCliPath) ? packagedCliPath : undefined) ??
    (existsSync(developmentCliPath) ? developmentCliPath : undefined);
  if (cliPath) process.env.MSFS_CLI_PATH = cliPath;
}

const healthHost = '127.0.0.1';
const configuredHealthPort = Number(process.env.AGENT_HEALTH_PORT ?? '8098');
const healthPort =
  Number.isInteger(configuredHealthPort) &&
  configuredHealthPort >= 1_024 &&
  configuredHealthPort <= 65_535
    ? configuredHealthPort
    : 8098;
const config = loadConfig();
const parentPort = process.parentPort;
const agentPath = fileURLToPath(new URL('./guide-agent.js', import.meta.url));
initializeLogger({ pretty: false, level: 'info' });
const server = new AgentServer(
  new ServerOptions({
    agent: agentPath,
    agentName: config.livekit.agentName,
    wsURL: config.livekit.url,
    apiKey: config.livekit.apiKey,
    apiSecret: config.livekit.apiSecret,
    host: healthHost,
    port: healthPort,
    numIdleProcesses: 0,
    production: false,
  }),
);

let stopping = false;
const stop = async (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  await server.close().catch(() => undefined);
  parentPort.postMessage({ type: 'stopped' });
  process.exit(exitCode);
};

parentPort.on('message', (event) => {
  if (event.data?.type === 'shutdown') void stop();
});
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

parentPort.postMessage({ type: 'started' });
void server.run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'AI Worker 启动失败';
  parentPort.postMessage({ type: 'error', message: message.slice(0, 320) });
  void stop(1);
});
