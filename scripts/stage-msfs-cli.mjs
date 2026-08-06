import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // CI and release builds may provide paths through the process environment.
}

const argumentsWithoutFlags = process.argv.slice(2).filter((value) => value !== '--strict');
const strict =
  process.argv.includes('--strict') || process.env.MSFS_CLI_REQUIRE_COMMUNITY_PACKAGE === 'true';
const configuredExecutable = process.env.MSFS_CLI_PATH?.trim();
const configuredDistribution = process.env.MSFS_CLI_DISTRIBUTION_DIR?.trim();
const adjacentBuildDirectory = resolve(projectRoot, '..', '微软模拟飞行cli', 'build');
const devDistributionDirectory = resolve(projectRoot, 'dev-runtime', 'msfs-cli');
const targets =
  argumentsWithoutFlags.length > 0
    ? argumentsWithoutFlags.map((target) => resolve(projectRoot, target))
    : [resolve(projectRoot, 'resources', 'msfs')];
const stagingDevRuntime = targets.some((target) => target === devDistributionDirectory);
const devDistributionAvailable =
  !stagingDevRuntime &&
  (await access(devDistributionDirectory)
    .then(() => true)
    .catch(() => false));
const sourceDirectory = configuredDistribution
  ? resolve(configuredDistribution)
  : stagingDevRuntime
    ? adjacentBuildDirectory
    : devDistributionAvailable
      ? devDistributionDirectory
      : configuredExecutable
        ? dirname(
            isAbsolute(configuredExecutable)
              ? configuredExecutable
              : resolve(projectRoot, configuredExecutable),
          )
        : adjacentBuildDirectory;

for (const target of targets) {
  if (target === sourceDirectory || relative(target, sourceDirectory) === '') {
    throw new Error(`MSFS CLI 暂存目标不能与来源目录相同：${target}`);
  }
}

const configuredCommunityPackage = process.env.MSFS_CLI_COMMUNITY_PACKAGE_DIR?.trim();
const sourceCommunityPackage = resolve(
  sourceDirectory,
  'community',
  'msfs-native-cli-route-bridge',
);
const adjacentCommunityPackage = resolve(
  projectRoot,
  '..',
  '微软模拟飞行cli',
  'wasm-route-bridge',
  'build',
  'package-tool',
  'msfs-native-cli-route-bridge',
);
const sourceContainsCommunityPackage = await access(sourceCommunityPackage)
  .then(() => true)
  .catch(() => false);
const communityPackageSource = configuredCommunityPackage
  ? resolve(configuredCommunityPackage)
  : sourceContainsCommunityPackage || strict
    ? sourceCommunityPackage
    : adjacentCommunityPackage;

const requiredFiles = ['msfs.exe', 'msfsd.exe'];
const optionalFiles = ['SimConnect.dll'];
const communityFiles = ['manifest.json', 'layout.json', 'modules/msfs-route-bridge.wasm'];

for (const file of requiredFiles) {
  await access(resolve(sourceDirectory, file)).catch(() => {
    throw new Error(`缺少 MSFS CLI 运行时文件：${resolve(sourceDirectory, file)}`);
  });
}
if (strict) {
  for (const file of optionalFiles) {
    await access(resolve(sourceDirectory, file)).catch(() => {
      throw new Error(`候选发布缺少 MSFS CLI 必需运行时文件：${resolve(sourceDirectory, file)}`);
    });
  }
}

let communityPackageReady = true;
for (const file of communityFiles) {
  try {
    await access(resolve(communityPackageSource, file));
  } catch {
    communityPackageReady = false;
    break;
  }
}
if (strict && !communityPackageReady) {
  throw new Error(`候选发布缺少同一 CLI 快照中的 Community Package：${communityPackageSource}`);
}

const sha256 = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const copiedFiles = [];

  for (const file of requiredFiles) {
    const destination = resolve(target, file);
    await copyFile(resolve(sourceDirectory, file), destination);
    copiedFiles.push(file);
  }
  for (const file of optionalFiles) {
    try {
      const destination = resolve(target, file);
      await copyFile(resolve(sourceDirectory, file), destination);
      copiedFiles.push(file);
    } catch {
      // Development builds may rely on an SDK-local SimConnect installation.
    }
  }

  if (communityPackageReady) {
    const targetCommunityPackage = resolve(target, 'community', 'msfs-native-cli-route-bridge');
    for (const file of communityFiles) {
      const destination = resolve(targetCommunityPackage, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(communityPackageSource, file), destination);
      copiedFiles.push(`community/msfs-native-cli-route-bridge/${file}`);
    }
  } else {
    process.stdout.write(`Warning: Community Package not staged from ${communityPackageSource}\n`);
  }

  const fileRecords = [];
  for (const file of copiedFiles.sort()) {
    const path = resolve(target, file);
    const information = await stat(path);
    fileRecords.push({
      path: file.replaceAll('\\', '/'),
      bytes: information.size,
      sha256: await sha256(path),
    });
  }
  const bridgeManifestPath = resolve(
    target,
    'community',
    'msfs-native-cli-route-bridge',
    'manifest.json',
  );
  const bridgeManifest = communityPackageReady
    ? JSON.parse(await readFile(bridgeManifestPath, 'utf8'))
    : undefined;
  const fingerprint = createHash('sha256').update(JSON.stringify(fileRecords)).digest('hex');
  const componentManifest = {
    schemaVersion: 1,
    component: 'msfs-cli-runtime',
    fingerprint,
    protocolMajor: 1,
    bridgePackageVersion: bridgeManifest?.package_version ?? null,
    files: fileRecords,
  };
  await writeFile(
    resolve(target, 'component-manifest.json'),
    `${JSON.stringify(componentManifest, null, 2)}\n`,
    'utf8',
  );
}

process.stdout.write(
  `MSFS CLI runtime snapshot staged from ${sourceDirectory} to ${targets.join(', ')}\n`,
);
