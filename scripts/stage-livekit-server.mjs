import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';

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

for (const file of requiredFiles) {
  const source =
    file === 'livekit-server.exe' ? sourceExecutable : resolve(dirname(sourceExecutable), file);
  await access(source).catch(() => {
    throw new Error(`缺少 LiveKit Server 发布文件：${source}`);
  });
}

for (const target of targets) {
  await mkdir(target, { recursive: true });
  for (const file of requiredFiles) {
    const source =
      file === 'livekit-server.exe' ? sourceExecutable : resolve(dirname(sourceExecutable), file);
    await copyFile(source, resolve(target, file));
  }
}

process.stdout.write(
  `LiveKit Server staged from ${dirname(sourceExecutable)} to ${targets.join(', ')}\n`,
);
