import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (process.platform !== 'win32') {
  console.log('Skipping the Windows-only global push-to-talk native module.');
  process.exit(0);
}

const nodeGyp = resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp',
);
if (!existsSync(nodeGyp)) {
  throw new Error('node-gyp is required to build the global push-to-talk native module.');
}

const result = spawnSync(nodeGyp, ['rebuild'], {
  cwd: resolve('native', 'global-ptt'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);
