import { join, resolve } from 'node:path';
import process from 'node:process';
import {
  activateMsfsCommunityVersion,
  type MsfsCommunityPackageVersion,
} from '../desktop/main/msfs-diagnostics.js';

const projectRoot = resolve(import.meta.dirname, '..');
const requestedVersion = process.argv[2];
if (requestedVersion !== 'development' && requestedVersion !== 'application') {
  throw new Error('用法：pnpm msfs:use:dev 或 pnpm msfs:use:app');
}

const version = requestedVersion as MsfsCommunityPackageVersion;
const sourcePath =
  version === 'development'
    ? join(projectRoot, 'dev-runtime', 'msfs-cli', 'community', 'msfs-native-cli-route-bridge')
    : undefined;
const result = await activateMsfsCommunityVersion({
  version,
  backupDirectory: join(projectRoot, 'dev-runtime', 'msfs-community-backups'),
  ...(sourcePath ? { sourcePath } : {}),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (['failed', 'conflict', 'source_invalid', 'not_found'].includes(result.status)) {
  process.exitCode = 1;
}
