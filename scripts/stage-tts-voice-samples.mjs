import { access, cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
const [sourceArgument = 'resources/tts', targetArgument = 'out/tts'] = process.argv.slice(2);
const sourceDirectory = resolve(projectRoot, sourceArgument);
const targetDirectory = resolve(projectRoot, targetArgument);

await access(sourceDirectory).catch(() => {
  throw new Error(`缺少 TTS 音色资源目录：${sourceDirectory}`);
});

await rm(targetDirectory, { recursive: true, force: true });
await mkdir(targetDirectory, { recursive: true });
await cp(sourceDirectory, targetDirectory, { recursive: true, force: true });

process.stdout.write(`TTS voice samples staged from ${sourceDirectory} to ${targetDirectory}\n`);
