import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
const executable = resolve(projectRoot, 'resources', 'livekit', 'livekit-server.exe');

if (!existsSync(executable)) {
  throw new Error(
    `未找到 ${executable}。请从 LiveKit 官方 Windows 发布页下载并校验 livekit-server.exe。`,
  );
}

const child = spawn(executable, ['--dev'], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: false,
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
