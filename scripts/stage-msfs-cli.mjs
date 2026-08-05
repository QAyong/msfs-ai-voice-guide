import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';

const projectRoot = resolve(import.meta.dirname, '..');
try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // CI and release builds may provide the source path directly through the process environment.
}
const configuredExecutable = process.env.MSFS_CLI_PATH?.trim();
const sourceDirectory = process.env.MSFS_CLI_DISTRIBUTION_DIR?.trim()
  ? resolve(process.env.MSFS_CLI_DISTRIBUTION_DIR)
  : configuredExecutable
    ? dirname(
        isAbsolute(configuredExecutable)
          ? configuredExecutable
          : resolve(projectRoot, configuredExecutable),
      )
    : resolve(projectRoot, '..', '微软模拟飞行cli', 'build');
const configuredCommunityPackage = process.env.MSFS_CLI_COMMUNITY_PACKAGE_DIR?.trim();
const communityPackageSource = configuredCommunityPackage
  ? resolve(configuredCommunityPackage)
  : resolve(
      projectRoot,
      '..',
      '微软模拟飞行cli',
      'wasm-route-bridge',
      'build',
      'package-tool',
      'msfs-native-cli-route-bridge',
    );
const targets =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((target) => resolve(projectRoot, target))
    : [resolve(projectRoot, 'resources', 'msfs')];
const requiredFiles = ['msfs.exe', 'msfsd.exe'];
const optionalFiles = ['SimConnect.dll'];
const communityFiles = ['manifest.json', 'layout.json', 'modules/msfs-route-bridge.wasm'];

for (const file of requiredFiles) {
  await access(resolve(sourceDirectory, file)).catch(() => {
    throw new Error(`缺少 MSFS CLI 运行时文件：${resolve(sourceDirectory, file)}`);
  });
}

for (const target of targets) {
  await mkdir(target, { recursive: true });
  for (const file of requiredFiles) {
    await copyFile(resolve(sourceDirectory, file), resolve(target, file));
  }
  for (const file of optionalFiles) {
    try {
      await copyFile(resolve(sourceDirectory, file), resolve(target, file));
    } catch {
      // SimConnect.dll 是否可再分发需按 SDK 许可决定；开发构建允许由本机 SDK 提供。
    }
  }

  const targetCommunityPackage = resolve(target, 'community', 'msfs-native-cli-route-bridge');
  let communityPackageReady = true;
  for (const file of communityFiles) {
    try {
      await access(resolve(communityPackageSource, file));
    } catch {
      communityPackageReady = false;
      break;
    }
  }
  if (communityPackageReady) {
    await mkdir(targetCommunityPackage, { recursive: true });
    for (const file of communityFiles) {
      const destination = resolve(targetCommunityPackage, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(communityPackageSource, file), destination);
    }
  } else if (process.env.MSFS_CLI_REQUIRE_COMMUNITY_PACKAGE === 'true') {
    throw new Error(`缺少 MSFS 2024 Community Package：${communityPackageSource}`);
  } else {
    process.stdout.write(`Warning: Community Package not staged from ${communityPackageSource}\n`);
  }
}

process.stdout.write(`MSFS CLI runtime staged from ${sourceDirectory} to ${targets.join(', ')}\n`);
