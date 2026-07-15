import { cli, ServerOptions } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config/schema.js';
import { checkProviderConfiguration } from './providers/health.js';

function printConfigurationCheck(): void {
  const config = loadConfig();
  const report = checkProviderConfiguration(config);
  process.stdout.write(`${JSON.stringify({ livekit: 'configured', ...report })}\n`);
}

function runAgentWorker(): void {
  const config = loadConfig();
  const agentPath = fileURLToPath(new URL('./agent/guide-agent.ts', import.meta.url));
  cli.runApp(
    new ServerOptions({
      agent: agentPath,
      agentName: config.livekit.agentName,
      wsURL: config.livekit.url,
      apiKey: config.livekit.apiKey,
      apiSecret: config.livekit.apiSecret,
    }),
  );
}

try {
  if (process.argv[2] === 'check') {
    printConfigurationCheck();
  } else {
    runAgentWorker();
  }
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
