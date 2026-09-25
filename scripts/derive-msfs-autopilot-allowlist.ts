import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { aircraftProbeDataSchema } from '../src/msfs/schemas.js';

const projectRoot = resolve(import.meta.dirname, '..');

type CliOptions = {
  inputPath: string;
  outputPath: string;
};

function usage(): void {
  process.stdout.write(
    `用法：\n  pnpm msfs:derive-allowlist -- --input <probe-artifact> [--output <path>]\n`,
  );
}

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 需要一个值。`);
  return value;
}

function parseArgs(argv: string[]): CliOptions | { help: true } {
  let inputPath: string | undefined;
  let outputPath = join(
    projectRoot,
    'docs',
    'msfs',
    'autopilot',
    'autopilot-supported-aircraft.json',
  );
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--input') {
      inputPath = resolve(projectRoot, takeValue(argv, index, '--input'));
      index += 1;
      continue;
    }
    if (argument === '--output') {
      outputPath = resolve(projectRoot, takeValue(argv, index, '--output'));
      index += 1;
      continue;
    }
    throw new Error(`未知选项：${argument}`);
  }
  if (!inputPath) throw new Error('--input 必须指定一次批量探测 artifact。');
  return { inputPath, outputPath };
}

const rawArgs = process.argv.slice(2);
const parsed = parseArgs(rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs);
if ('help' in parsed) {
  usage();
} else {
  const source = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(parsed.inputPath, 'utf8')) as unknown);
  const data = aircraftProbeDataSchema.parse(source.data);
  const passiveAircraftPattern = /^(?:Asobo|Microsoft) PassiveAircraft\b/iu;
  const supportedAircraft = data.results.filter(
    (result) =>
      result.status === 'supported' && !passiveAircraftPattern.test(result.aircraft_title),
  );
  await mkdir(dirname(parsed.outputPath), { recursive: true });
  await writeFile(
    parsed.outputPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt:
          typeof source.collectedAt === 'string' ? source.collectedAt : new Date().toISOString(),
        sourceProbeArtifact: parsed.inputPath,
        rule: 'status=supported and title is not a PassiveAircraft SimObject',
        count: supportedAircraft.length,
        aircraft: supportedAircraft,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        outputPath: parsed.outputPath,
        sourceProbeArtifact: parsed.inputPath,
        count: supportedAircraft.length,
      },
      null,
      2,
    )}\n`,
  );
}
