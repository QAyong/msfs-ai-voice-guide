import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fingerprintFiles } from './incremental-build-utils.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // Release builds may provide the source path through the process environment.
}

const configuredExecutable = process.env.LIVEKIT_SERVER_PATH?.trim();
const sourceExecutable = configuredExecutable
  ? isAbsolute(configuredExecutable)
    ? configuredExecutable
    : resolve(projectRoot, configuredExecutable)
  : resolve(projectRoot, 'resources', 'livekit', 'livekit-server.exe');
const targets =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((target) => resolve(projectRoot, target))
    : [resolve(projectRoot, 'out', 'livekit')];
const requiredFiles = ['livekit-server.exe', 'LICENSE'];
const cachePath = resolve(projectRoot, 'dev-runtime', 'build-cache', 'livekit.json');

for (const file of requiredFiles) {
  const source =
    file === 'livekit-server.exe' ? sourceExecutable : resolve(dirname(sourceExecutable), file);
  await access(source).catch(() => {
    throw new Error(`缺少 LiveKit Server 发布文件：${source}`);
  });
}

const sourceFingerprint = await fingerprintFiles(
  requiredFiles.map((file) => ({
    label: file,
    path:
      file === 'livekit-server.exe' ? sourceExecutable : resolve(dirname(sourceExecutable), file),
  })),
);
let cachedStage;
try {
  cachedStage = JSON.parse(await readFile(cachePath, 'utf8'));
} catch {
  cachedStage = undefined;
}

for (const target of targets) {
  if (cachedStage?.schemaVersion === 1 && cachedStage.fingerprint === sourceFingerprint) {
    try {
      const targetFingerprint = await fingerprintFiles(
        requiredFiles.map((file) => ({
          label: file,
          path: resolve(target, file),
        })),
      );
      if (targetFingerprint === sourceFingerprint) {
        process.stdout.write(`Reusing unchanged LiveKit Server resources: ${target}\n`);
        continue;
      }
    } catch {
      // A missing or incomplete target is rebuilt below.
    }
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of requiredFiles) {
    const source =
      file === 'livekit-server.exe' ? sourceExecutable : resolve(dirname(sourceExecutable), file);
    await copyFile(source, resolve(target, file));
  }
}

await mkdir(resolve(projectRoot, 'dev-runtime', 'build-cache'), { recursive: true });
await writeFile(
  cachePath,
  `${JSON.stringify({ schemaVersion: 1, fingerprint: sourceFingerprint }, null, 2)}\n`,
  'utf8',
);

process.stdout.write(
  `LiveKit Server staged from ${dirname(sourceExecutable)} to ${targets.join(', ')}\n`,
);
