import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fingerprintDirectory, fingerprintFiles } from './incremental-build-utils.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const nativeSourceDirectory = resolve(projectRoot, 'native', 'global-ptt');
const outputPath = resolve(nativeSourceDirectory, 'build', 'Release', 'global_push_to_talk.node');
const cachePath = resolve(projectRoot, 'dev-runtime', 'build-cache', 'global-ptt.json');

if (process.platform !== 'win32') {
  console.log('Skipping the Windows-only global push-to-talk native module.');
  process.exit(0);
}

const nodeGyp = resolve(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp',
);
if (!existsSync(nodeGyp)) {
  throw new Error('node-gyp is required to build the global push-to-talk native module.');
}

const sourceFingerprint = await fingerprintDirectory(resolve(nativeSourceDirectory, 'src'));
const dependencyFingerprint = await fingerprintFiles([
  { label: 'binding.gyp', path: resolve(nativeSourceDirectory, 'binding.gyp') },
  { label: 'package.json', path: resolve(projectRoot, 'package.json') },
  { label: 'pnpm-lock.yaml', path: resolve(projectRoot, 'pnpm-lock.yaml') },
]);
const sha256 = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
const fingerprint = createHash('sha256')
  .update(
    JSON.stringify({
      source: sourceFingerprint.fingerprint,
      dependencies: dependencyFingerprint,
      nodeVersion: process.version,
      nodeAbi: process.versions.modules,
      platform: process.platform,
      arch: process.arch,
    }),
  )
  .digest('hex');

let cachedBuild;
try {
  cachedBuild = JSON.parse(await readFile(cachePath, 'utf8'));
} catch {
  cachedBuild = undefined;
}
const existingOutputSha256 = existsSync(outputPath)
  ? await sha256(outputPath).catch(() => undefined)
  : undefined;
if (
  existingOutputSha256 &&
  cachedBuild?.schemaVersion === 1 &&
  cachedBuild.fingerprint === fingerprint &&
  cachedBuild.outputSha256 === existingOutputSha256
) {
  process.stdout.write(`Reusing unchanged global push-to-talk native module: ${outputPath}\n`);
  process.exit(0);
}

const result = spawnSync(nodeGyp, ['rebuild'], {
  cwd: nativeSourceDirectory,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);

const outputSha256 = await sha256(outputPath);
await mkdir(resolve(projectRoot, 'dev-runtime', 'build-cache'), { recursive: true });
await writeFile(
  cachePath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      fingerprint,
      output: 'native/global-ptt/build/Release/global_push_to_talk.node',
      outputSha256,
      sourceFiles: sourceFingerprint.files,
      nodeVersion: process.version,
      nodeAbi: process.versions.modules,
      platform: process.platform,
      arch: process.arch,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
