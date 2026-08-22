import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fingerprintDirectory } from './incremental-build-utils.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const [sourceArgument = 'resources/tts', targetArgument = 'out/tts'] = process.argv.slice(2);
const sourceDirectory = resolve(projectRoot, sourceArgument);
const targetDirectory = resolve(projectRoot, targetArgument);
const cachePath = resolve(projectRoot, 'dev-runtime', 'build-cache', 'tts.json');

await access(sourceDirectory).catch(() => {
  throw new Error(`缺少 TTS 音色资源目录：${sourceDirectory}`);
});

const sourceFingerprint = await fingerprintDirectory(sourceDirectory);
let cachedStage;
try {
  cachedStage = JSON.parse(await readFile(cachePath, 'utf8'));
} catch {
  cachedStage = undefined;
}
if (cachedStage?.schemaVersion === 1 && cachedStage.fingerprint === sourceFingerprint.fingerprint) {
  try {
    const targetFingerprint = await fingerprintDirectory(targetDirectory);
    if (targetFingerprint.fingerprint === sourceFingerprint.fingerprint) {
      process.stdout.write(`Reusing unchanged TTS voice samples: ${targetDirectory}\n`);
      process.exit(0);
    }
  } catch {
    // A missing or incomplete target is rebuilt below.
  }
}

await rm(targetDirectory, { recursive: true, force: true });
await mkdir(targetDirectory, { recursive: true });
await cp(sourceDirectory, targetDirectory, { recursive: true, force: true });

await mkdir(resolve(projectRoot, 'dev-runtime', 'build-cache'), { recursive: true });
await writeFile(
  cachePath,
  `${JSON.stringify({ schemaVersion: 1, fingerprint: sourceFingerprint.fingerprint, files: sourceFingerprint.files }, null, 2)}\n`,
  'utf8',
);

process.stdout.write(`TTS voice samples staged from ${sourceDirectory} to ${targetDirectory}\n`);
