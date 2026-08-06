import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputPaths = [
  'out/main',
  'out/preload',
  'out/renderer',
  'out/livekit',
  'out/msfs',
  'out/tts',
  'out/release-manifest.json',
].map((path) => resolve(projectRoot, path));

await Promise.all(outputPaths.map((path) => rm(path, { recursive: true, force: true })));
process.stdout.write(`Cleaned desktop build outputs under ${resolve(projectRoot, 'out')}\n`);
