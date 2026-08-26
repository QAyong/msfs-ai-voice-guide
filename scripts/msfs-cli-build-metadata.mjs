import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

export const MSFS_CLI_BUILD_METADATA_FILE = 'build-metadata.json';
export const MSFS_CLI_BUILD_METADATA_SCHEMA_VERSION = 2;
export const MSFS_CLI_SOURCE_SCOPE = 'native-build-inputs';

const runGit = async (projectRoot, args) => {
  try {
    const result = await execFileAsync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 MSFS CLI 源码版本：${message}`, { cause: error });
  }
};

const hashFiles = async (projectRoot, relativePaths) => {
  const hash = createHash('sha256');
  for (const relativePath of [...relativePaths].sort((left, right) => left.localeCompare(right))) {
    hash.update(relativePath.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await readFile(resolve(projectRoot, relativePath)));
    hash.update('\0');
  }
  return hash.digest('hex');
};

export const getMsfsCliSourceIdentity = async (projectRoot) => {
  const nativeSourceFiles = (await runGit(projectRoot, ['ls-files', '--', 'native/msfs-cli']))
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !value.toLowerCase().endsWith('.md'));
  if (nativeSourceFiles.length === 0) {
    throw new Error('没有找到 native/msfs-cli 的受 Git 管理源码。');
  }

  const nativeStatus = await runGit(projectRoot, [
    'status',
    '--porcelain',
    '--',
    'native/msfs-cli',
  ]);
  const dirty = nativeStatus
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .some((path) => !path.toLowerCase().endsWith('.md'));
  return {
    scope: MSFS_CLI_SOURCE_SCOPE,
    commit: await runGit(projectRoot, ['log', '-1', '--format=%H', '--', ...nativeSourceFiles]),
    fingerprint: await hashFiles(projectRoot, nativeSourceFiles),
    fileCount: nativeSourceFiles.length,
    dirty,
  };
};

export const getFileRecord = async (path, relativePath) => ({
  path: relativePath.replaceAll('\\', '/'),
  bytes: (await stat(path)).size,
  sha256: createHash('sha256')
    .update(await readFile(path))
    .digest('hex'),
});

export const createMsfsCliBuildMetadata = async ({ projectRoot, buildDirectory }) => {
  const source = await getMsfsCliSourceIdentity(projectRoot);
  const files = [];
  for (const relativePath of ['msfs.exe', 'msfsd.exe', 'SimConnect.dll']) {
    const path = resolve(buildDirectory, relativePath);
    try {
      files.push(await getFileRecord(path, relativePath));
    } catch {
      // Development builds may use an SDK-local SimConnect.dll at runtime.
    }
  }

  return {
    schemaVersion: MSFS_CLI_BUILD_METADATA_SCHEMA_VERSION,
    component: 'msfs-native-build',
    platform: 'win32-x64',
    configuration: 'Release',
    builtAt: new Date().toISOString(),
    source,
    files,
  };
};

export const readMsfsCliBuildMetadata = async (path) => JSON.parse(await readFile(path, 'utf8'));

export const validateMsfsCliBuildMetadata = async ({
  projectRoot,
  metadataPath,
  buildDirectory,
  requireSimConnect,
}) => {
  let metadata;
  try {
    metadata = await readMsfsCliBuildMetadata(metadataPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 MSFS CLI 构建清单 ${metadataPath}：${message}`, { cause: error });
  }

  if (
    metadata?.schemaVersion !== MSFS_CLI_BUILD_METADATA_SCHEMA_VERSION ||
    metadata?.component !== 'msfs-native-build' ||
    metadata?.platform !== 'win32-x64' ||
    metadata?.configuration !== 'Release' ||
    !metadata?.source ||
    metadata.source.scope !== MSFS_CLI_SOURCE_SCOPE ||
    !Array.isArray(metadata.files)
  ) {
    throw new Error(`MSFS CLI 构建清单格式无效：${metadataPath}`);
  }

  const currentSource = await getMsfsCliSourceIdentity(projectRoot);
  if (metadata.source.dirty !== false) {
    throw new Error(
      'MSFS CLI 构建清单来自未清理的源码工作区；请提交或清理 native/msfs-cli 的改动后再发布。',
    );
  }
  if (
    metadata.source.commit !== currentSource.commit ||
    metadata.source.fingerprint !== currentSource.fingerprint ||
    metadata.source.fileCount !== currentSource.fileCount
  ) {
    if (metadata.source.commit !== currentSource.commit) {
      throw new Error(
        `MSFS CLI 构建提交不匹配：快照为 ${metadata.source.commit}，当前源码为 ${currentSource.commit}。请重新编译并生成新的发布快照。`,
      );
    }
    throw new Error('MSFS CLI 源码指纹与构建清单不匹配；请重新编译当前 native/msfs-cli 后再发布。');
  }
  if (currentSource.dirty) {
    throw new Error(
      'MSFS CLI 源码工作区不是干净状态；请提交或清理 native/msfs-cli 的改动后再发布。',
    );
  }

  const records = new Map(metadata.files.map((file) => [file.path.replaceAll('\\', '/'), file]));
  for (const relativePath of [
    'msfs.exe',
    'msfsd.exe',
    ...(requireSimConnect ? ['SimConnect.dll'] : []),
  ]) {
    const record = records.get(relativePath);
    if (!record) {
      throw new Error(`MSFS CLI 构建清单缺少 ${relativePath}：${metadataPath}`);
    }
    const actual = await getFileRecord(resolve(buildDirectory, relativePath), relativePath);
    if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) {
      throw new Error(`MSFS CLI 文件与构建清单不一致：${relativePath}`);
    }
  }

  return metadata;
};
