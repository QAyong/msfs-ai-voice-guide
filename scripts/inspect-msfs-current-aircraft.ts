import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { inspectCurrentAircraft } from '../src/msfs/aircraft-inspector.js';
import { MsfsCliClient } from '../src/msfs/cli-client.js';
import { loadMsfsConfig } from '../src/config/schema.js';
import { resolveMsfsCliPath } from '../src/msfs/path.js';

const projectRoot = resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // The caller may provide MSFS_* values through the process environment.
}

type CliOptions = {
  outputPath?: string;
  maxInputEventDetails: number;
};

function usage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:inspect -- [--output <path>] [--max-input-event-details <count>]\n\n` +
      `说明：\n` +
      `  只读取当前已加载飞机的身份、自动驾驶 SimVar 和相关 Input Event，不发送任何写入命令。\n` +
      `  未指定 --output 时，结果写入 docs/msfs/autopilot/inspections/<fingerprint>.json。\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let outputPath: string | undefined;
  let maxInputEventDetails = 128;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--output') {
      outputPath = resolve(projectRoot, takeValue(argv, index, '--output'));
      index += 1;
      continue;
    }
    if (argument === '--max-input-event-details') {
      const value = Number(takeValue(argv, index, '--max-input-event-details'));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('--max-input-event-details 必须是非负整数。');
      }
      maxInputEventDetails = value;
      index += 1;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }
  return { ...(outputPath ? { outputPath } : {}), maxInputEventDetails };
}

const rawArgs = process.argv.slice(2);
const parsed = parseArgs(rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs);
if ('help' in parsed) {
  usage();
} else {
  const config = loadMsfsConfig();
  const executablePath = resolveMsfsCliPath({
    ...(config.cliPath ? { configuredPath: config.cliPath } : {}),
    developmentPath: resolve(projectRoot, 'dev-runtime', 'msfs-cli', 'msfs.exe'),
    resourcesPath: resolve(projectRoot, 'resources'),
    cwd: projectRoot,
  });
  const client = new MsfsCliClient({
    executablePath,
    timeoutMs: config.timeoutMs,
    maxConcurrency: config.maxConcurrency,
    role: 'monitor',
    onDiagnostic: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  });
  const inspection = await inspectCurrentAircraft(client, {
    maxInputEventDetails: parsed.maxInputEventDetails,
  });
  const outputPath =
    parsed.outputPath ??
    join(projectRoot, 'docs', 'msfs', 'autopilot', 'inspections', `${inspection.fingerprint}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(inspection, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath,
        fingerprint: inspection.fingerprint,
        collection: inspection.collection,
        aircraft: inspection.aircraft,
        autopilotAvailability: inspection.autopilot.availability,
        spawnableAircraftTitleCount: inspection.spawnableAircraft.uniqueTitleCount,
        spawnableAircraftLiveryEntryCount: inspection.spawnableAircraft.items.length,
        inputEventCount: inspection.autopilot.inputEvents.events.length,
      },
      null,
      2,
    )}\n`,
  );
  if (inspection.collection.status === 'unavailable') process.exitCode = 1;
}
