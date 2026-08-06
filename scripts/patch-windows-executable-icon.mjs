import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

if (process.platform !== 'win32') {
  console.log('Skipping Windows executable icon patch on non-Windows platform.');
  process.exit(0);
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = join(
  projectRoot,
  'release-v2',
  'artifacts',
  'win-unpacked',
  '晓晓飞行导游.exe',
);
const iconPath = join(projectRoot, 'resources', 'app-icon.ico');
const cacheRoot =
  process.env.ELECTRON_BUILDER_CACHE?.trim() ||
  join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache');

function findRcedit(root) {
  if (!existsSync(root)) {
    return undefined;
  }

  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const candidate = join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'rcedit-x64.exe') {
        return candidate;
      }
      if (entry.isDirectory()) {
        pending.push(candidate);
      }
    }
  }

  return undefined;
}

if (!existsSync(executablePath)) {
  throw new Error(`打包后的可执行文件不存在：${executablePath}`);
}
if (!existsSync(iconPath)) {
  throw new Error(`应用图标不存在：${iconPath}`);
}

const rceditPath = findRcedit(cacheRoot);
if (!rceditPath) {
  throw new Error(`找不到 rcedit-x64.exe。请确认 electron-builder 缓存目录存在：${cacheRoot}`);
}

console.log(`Patching application icon with ${rceditPath}`);
const result = spawnSync(rceditPath, [executablePath, '--set-icon', iconPath], {
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`rcedit 写入应用图标失败，退出码：${result.status}`);
}

console.log(`Application icon patched: ${executablePath}`);
