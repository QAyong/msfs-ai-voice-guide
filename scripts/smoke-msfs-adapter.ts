import { resolve } from 'node:path';
import { loadConfig } from '../src/config/schema.js';
import { MsfsCliClient } from '../src/msfs/cli-client.js';
import { MsfsGuideService } from '../src/msfs/guide-service.js';
import { resolveMsfsCliPath } from '../src/msfs/path.js';

const config = loadConfig();
const service = new MsfsGuideService(
  new MsfsCliClient({
    executablePath: resolveMsfsCliPath({
      ...(config.msfs.cliPath ? { configuredPath: config.msfs.cliPath } : {}),
      developmentPath: resolve(import.meta.dirname, '..', 'dev-runtime', 'msfs-cli', 'msfs.exe'),
      cwd: resolve(import.meta.dirname, '..'),
    }),
    timeoutMs: config.msfs.timeoutMs,
    maxConcurrency: config.msfs.maxConcurrency,
    onDiagnostic: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  }),
  {
    trackIntervalMs: config.msfs.trackIntervalMs,
    trackMaximumPoints: config.msfs.trackMaximumPoints,
  },
);

try {
  const readiness = await service.warmup();
  process.stdout.write(`${JSON.stringify(readiness)}\n`);
  if (readiness.status === 'ready') {
    const autopilotStatus = await service.getAutopilotStatus();
    process.stdout.write(`${JSON.stringify(autopilotStatus)}\n`);
    const snapshot = await service.getFlightSnapshot();
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
  }
} finally {
  await service.close();
}
