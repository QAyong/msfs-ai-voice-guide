import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const preserveStagedResources = process.argv.includes('--incremental');
const outputPaths = [
  'out/main',
  'out/preload',
  'out/renderer',
  'out/release-manifest.json',
  ...(preserveStagedResources ? [] : ['out/livekit', 'out/msfs', 'out/tts']),
].map((path) => resolve(projectRoot, path));

await Promise.all(outputPaths.map((path) => rm(path, { recursive: true, force: true })));
process.stdout.write(
  `${preserveStagedResources ? 'Preserved staged release resources; cleaned desktop code outputs' : 'Cleaned desktop build outputs'} under ${resolve(projectRoot, 'out')}\n`,
);
