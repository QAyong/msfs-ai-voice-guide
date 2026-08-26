import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import {
  MSFS_CLI_BUILD_METADATA_FILE,
  validateMsfsCliBuildMetadata,
} from './msfs-cli-build-metadata.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // CI and release builds may provide paths through the process environment.
}

const argumentsWithoutFlags = process.argv
  .slice(2)
  .filter((value) => value !== '--strict' && value !== '--release');
const releaseBuild =
  process.argv.includes('--release') || process.env.MSFS_CLI_REQUIRE_RELEASE_SNAPSHOT === 'true';
const strict =
  process.argv.includes('--strict') ||
  releaseBuild ||
  process.env.MSFS_CLI_REQUIRE_COMMUNITY_PACKAGE === 'true';
const configuredExecutable = process.env.MSFS_CLI_PATH?.trim();
const configuredDistribution = process.env.MSFS_CLI_DISTRIBUTION_DIR?.trim();
const nativeCliProjectDirectory = resolve(projectRoot, 'native', 'msfs-cli');
const nativeCliBuildDirectory = resolve(nativeCliProjectDirectory, 'build');
const developmentCliBuildDirectory = resolve(projectRoot, 'dev-runtime', 'msfs-cli-build');
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
const developmentBuildAvailable = await access(resolve(developmentCliBuildDirectory, 'msfs.exe'))
  .then(() => true)
  .catch(() => false);
if (releaseBuild && !configuredDistribution) {
  throw new Error(
    '候选或正式发布必须设置 MSFS_CLI_DISTRIBUTION_DIR，指向同一构建批次的已验证 CLI 发布快照。',
  );
}
const sourceDirectory = configuredDistribution
  ? resolve(configuredDistribution)
  : stagingDevRuntime
    ? developmentBuildAvailable
      ? developmentCliBuildDirectory
      : nativeCliBuildDirectory
    : devDistributionAvailable
      ? devDistributionDirectory
      : developmentBuildAvailable
        ? developmentCliBuildDirectory
        : configuredExecutable
          ? dirname(
              isAbsolute(configuredExecutable)
                ? configuredExecutable
                : resolve(projectRoot, configuredExecutable),
            )
          : nativeCliBuildDirectory;

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
const nativeCommunityPackage = resolve(
  nativeCliProjectDirectory,
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
    : nativeCommunityPackage;

const requiredFiles = ['msfs.exe', 'msfsd.exe'];
const optionalFiles = ['SimConnect.dll'];
const communityFiles = ['manifest.json', 'layout.json', 'modules/msfs-route-bridge.wasm'];
const comparePaths = (left, right) => left.localeCompare(right);

if (releaseBuild) requiredFiles.push(MSFS_CLI_BUILD_METADATA_FILE);

const isWithin = (child, parent) => {
  const relativePath = relative(parent, child);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
};

if (
  releaseBuild &&
  [nativeCliProjectDirectory, developmentCliBuildDirectory, devDistributionDirectory].some((path) =>
    isWithin(sourceDirectory, path),
  )
) {
  throw new Error(
    `正式打包不能使用开发 CLI 构建目录：${sourceDirectory}。请设置 MSFS_CLI_DISTRIBUTION_DIR 指向已验证发布快照。`,
  );
}
if (
  releaseBuild &&
  configuredCommunityPackage &&
  !isWithin(resolve(configuredCommunityPackage), sourceDirectory)
) {
  throw new Error(
    `正式打包要求 CLI 与 Community Package 来自同一发布快照：${configuredCommunityPackage} 不在 ${sourceDirectory} 内。`,
  );
}

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

if (releaseBuild) {
  const metadata = await validateMsfsCliBuildMetadata({
    projectRoot,
    metadataPath: resolve(sourceDirectory, MSFS_CLI_BUILD_METADATA_FILE),
    buildDirectory: sourceDirectory,
    requireSimConnect: true,
  });
  process.stdout.write(
    `Validated MSFS CLI release snapshot ${metadata.source.commit.slice(0, 12)} from ${sourceDirectory}\n`,
  );
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

const sourceFiles = [];
for (const file of requiredFiles) {
  sourceFiles.push({ source: resolve(sourceDirectory, file), path: file });
}
for (const file of optionalFiles) {
  if (
    await access(resolve(sourceDirectory, file))
      .then(() => true)
      .catch(() => false)
  ) {
    sourceFiles.push({ source: resolve(sourceDirectory, file), path: file });
  }
}
if (!releaseBuild) {
  const metadataPath = resolve(sourceDirectory, MSFS_CLI_BUILD_METADATA_FILE);
  if (await access(metadataPath).then(() => true).catch(() => false)) {
    sourceFiles.push({ source: metadataPath, path: MSFS_CLI_BUILD_METADATA_FILE });
  }
}
if (communityPackageReady) {
  for (const file of communityFiles) {
    sourceFiles.push({
      source: resolve(communityPackageSource, file),
      path: `community/msfs-native-cli-route-bridge/${file}`,
    });
  }
}

const sourceFileRecords = [];
for (const file of sourceFiles.sort((left, right) => comparePaths(left.path, right.path))) {
  const information = await stat(file.source);
  sourceFileRecords.push({
    path: file.path.replaceAll('\\', '/'),
    bytes: information.size,
    sha256: await sha256(file.source),
  });
}
const sourceFingerprint = createHash('sha256')
  .update(JSON.stringify(sourceFileRecords))
  .digest('hex');

const canReuseTarget = async (target) => {
  try {
    const componentManifest = JSON.parse(
      await readFile(resolve(target, 'component-manifest.json'), 'utf8'),
    );
    if (
      componentManifest.schemaVersion !== 1 ||
      componentManifest.component !== 'msfs-cli-runtime' ||
      componentManifest.fingerprint !== sourceFingerprint ||
      JSON.stringify(componentManifest.files) !== JSON.stringify(sourceFileRecords)
    ) {
      return false;
    }
    for (const file of sourceFileRecords) {
      const information = await stat(resolve(target, file.path));
      if (
        information.size !== file.bytes ||
        (await sha256(resolve(target, file.path))) !== file.sha256
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

for (const target of targets) {
  if (await canReuseTarget(target)) {
    process.stdout.write(`Reusing unchanged MSFS CLI runtime snapshot: ${target}\n`);
    continue;
  }
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
  if (!releaseBuild && sourceFiles.some((file) => file.path === MSFS_CLI_BUILD_METADATA_FILE)) {
    await copyFile(
      resolve(sourceDirectory, MSFS_CLI_BUILD_METADATA_FILE),
      resolve(target, MSFS_CLI_BUILD_METADATA_FILE),
    );
    copiedFiles.push(MSFS_CLI_BUILD_METADATA_FILE);
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
  for (const file of copiedFiles.sort(comparePaths)) {
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
