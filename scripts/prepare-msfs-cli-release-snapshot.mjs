import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  MSFS_CLI_BUILD_METADATA_FILE,
  validateMsfsCliBuildMetadata,
} from './msfs-cli-build-metadata.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const snapshotArgument = process.argv[2];
if (!snapshotArgument || snapshotArgument.startsWith('-')) {
  throw new Error(
    '用法：pnpm msfs:release:snapshot release-inputs/<build-id>；目标必须是一个新的快照目录。',
  );
}

const buildDirectory = resolve(
  projectRoot,
  process.env.MSFS_CLI_BUILD_DIRECTORY?.trim() || 'dev-runtime/msfs-cli-build',
);
const communityDirectory = resolve(
  projectRoot,
  process.env.MSFS_CLI_COMMUNITY_PACKAGE_DIR?.trim() ||
    'native/msfs-cli/wasm-route-bridge/build/package-tool/msfs-native-cli-route-bridge',
);
const snapshotDirectory = resolve(projectRoot, snapshotArgument);
const cliFiles = ['msfs.exe', 'msfsd.exe', 'SimConnect.dll', MSFS_CLI_BUILD_METADATA_FILE];
const communityFiles = ['manifest.json', 'layout.json', 'modules/msfs-route-bridge.wasm'];

const requireFile = async (directory, relativePath, label) => {
  const path = resolve(directory, relativePath);
  await access(path).catch(() => {
    throw new Error(`缺少${label}：${path}`);
  });
  return path;
};

await validateMsfsCliBuildMetadata({
  projectRoot,
  metadataPath: await requireFile(
    buildDirectory,
    MSFS_CLI_BUILD_METADATA_FILE,
    ' MSFS CLI 构建清单',
  ),
  buildDirectory,
  requireSimConnect: true,
});

for (const relativePath of cliFiles) {
  await requireFile(buildDirectory, relativePath, ' MSFS CLI 发布文件');
}
for (const relativePath of communityFiles) {
  await requireFile(communityDirectory, relativePath, ' Community Package 文件');
}

await access(snapshotDirectory).then(
  () => {
    throw new Error(`发布快照目录已存在，为避免混入旧文件而拒绝覆盖：${snapshotDirectory}`);
  },
  () => undefined,
);

for (const relativePath of cliFiles) {
  const destination = resolve(snapshotDirectory, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(buildDirectory, relativePath), destination);
}
for (const relativePath of communityFiles) {
  const destination = resolve(
    snapshotDirectory,
    'community',
    'msfs-native-cli-route-bridge',
    relativePath,
  );
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(communityDirectory, relativePath), destination);
}

process.stdout.write(`MSFS CLI release snapshot prepared: ${snapshotDirectory}\n`);
