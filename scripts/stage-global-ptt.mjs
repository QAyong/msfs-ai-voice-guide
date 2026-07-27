import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('native', 'global-ptt', 'build', 'Release', 'global_push_to_talk.node');
const targetDirectory = resolve('out', 'main', 'native');
try {
  await stat(source);
} catch {
  throw new Error('The global push-to-talk native module was not built.');
}
await mkdir(targetDirectory, { recursive: true });
await cp(source, resolve(targetDirectory, 'global-push-to-talk.node'));
