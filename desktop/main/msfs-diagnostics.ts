import { access, copyFile, cp, lstat, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import {
  routeDataSchema,
  statusDataSchema,
  systemStateDataSchema,
} from '../../src/msfs/schemas.js';
import type { MsfsCommandResult } from '../../src/msfs/types.js';
import {
  msfsConfigurationDiagnosticSchema,
  type MsfsConfigurationDiagnostic,
  type MsfsDiagnosticCheck,
} from '../../shared/msfs-desktop.js';
import { localizeDesktopText, type DesktopLocale } from '../../shared/desktop-locale.js';

const packageName = 'msfs-native-cli-route-bridge';
const packageTitle = 'MSFS Native CLI EFB Route Bridge';
const versionStoreDirectory = '_晓晓飞行导游版本库';
const versionStoreNames = {
  development: '开发版本',
  application: '应用版本',
} as const;
const communityPackageFiles = [
  'manifest.json',
  'layout.json',
  join('modules', 'msfs-route-bridge.wasm'),
] as const;

export type MsfsDiagnosticsOptions = {
  executablePath: string;
  timeoutMs: number;
  maxConcurrency: number;
  locale?: DesktopLocale;
  userCfgCandidates?: readonly string[];
  packageSourcePath?: string;
  client?: MsfsCliClient;
};

export type MsfsUserConfig = {
  path: string;
  installedPackagesPath: string;
};

export type MsfsCommunityPackageInstallOptions = {
  sourcePath: string;
  userCfgCandidates?: readonly string[];
  backupDirectory: string;
};

export type MsfsCommunityPackageVersion = keyof typeof versionStoreNames;

export type MsfsCommunityPackageActivationOptions = {
  version: MsfsCommunityPackageVersion;
  sourcePath?: string;
  userCfgCandidates?: readonly string[];
  backupDirectory: string;
};

export type MsfsCommunityPackageInstallResult = {
  status: 'installed' | 'already_current' | 'not_found' | 'source_invalid' | 'conflict' | 'failed';
  message: string;
  userCfgPath?: string;
  communityPackagePath?: string;
  versionStorePath?: string;
};

const exists = async (path: string): Promise<boolean> =>
  access(path, constants.F_OK)
    .then(() => true)
    .catch(() => false);

const localizeMsfsDiagnosticDetail = (detail: string, locale: DesktopLocale): string =>
  locale === 'en-US'
    ? detail.replaceAll(
        'Community Package 路径不在 Community2024 目录内。',
        'The Community Package path must remain inside the Community2024 directory.',
      )
    : detail;

export function parseInstalledPackagesPath(contents: string): string | undefined {
  const match = contents.match(/InstalledPackagesPath\s+"([^"]+)"/iu);
  return match?.[1]?.trim() || undefined;
}

export function resolveCommunityPackagePath(
  installedPackagesPath: string,
  packageDirectory = packageName,
): string {
  return resolveCommunityPath(installedPackagesPath, packageDirectory);
}

export function resolveMsfsCommunityVersionPath(
  installedPackagesPath: string,
  version: MsfsCommunityPackageVersion,
): string {
  return resolveCommunityPath(
    installedPackagesPath,
    versionStoreDirectory,
    versionStoreNames[version],
    packageName,
  );
}

export async function findMsfsUserConfig(
  candidates: readonly string[],
): Promise<MsfsUserConfig | undefined> {
  for (const candidate of candidates) {
    try {
      const contents = await readFile(candidate, 'utf8');
      const installedPackagesPath = parseInstalledPackagesPath(contents);
      if (installedPackagesPath) return { path: candidate, installedPackagesPath };
    } catch {
      // Try the next known Steam or Microsoft Store location.
    }
  }
  return undefined;
}

const check = (
  id: MsfsDiagnosticCheck['id'],
  status: MsfsDiagnosticCheck['status'],
  message: string,
  detail?: string,
): MsfsDiagnosticCheck => ({ id, status, message, ...(detail ? { detail } : {}) });

const resultCode = (result: MsfsCommandResult<unknown>): string | undefined =>
  result.status === 'ok' ? undefined : result.code;

const resolveCommunityPath = (installedPackagesPath: string, ...parts: string[]): string => {
  const communityRoot = resolve(installedPackagesPath, 'Community2024');
  const target = resolve(communityRoot, ...parts);
  const normalizedRoot = `${normalize(communityRoot)}${sep}`.toLowerCase();
  const normalizedTarget = normalize(target).toLowerCase();
  if (
    normalizedTarget !== normalize(communityRoot).toLowerCase() &&
    !normalizedTarget.startsWith(normalizedRoot)
  ) {
    throw new Error('Community Package 路径不在 Community2024 目录内。');
  }
  return target;
};

const checkCommunityPackageFiles = async (
  path: string,
  locale: DesktopLocale = 'zh-CN',
): Promise<{ ok: boolean; message: string }> => {
  const missing: string[] = [];
  for (const relativePath of communityPackageFiles) {
    const file = join(path, relativePath);
    if (!(await exists(file))) missing.push(file.slice(path.length + 1));
  }
  if (missing.length > 0) {
    return {
      ok: false,
      message: localizeDesktopText(
        locale,
        `Missing files: ${missing.join(', ')}`,
        `缺少文件：${missing.join('、')}`,
      ),
    };
  }

  try {
    const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')) as {
      package_name?: string;
      name?: string;
    };
    const name = manifest.package_name ?? manifest.name;
    if (name && name !== packageName) {
      return {
        ok: false,
        message: localizeDesktopText(
          locale,
          `Package name does not match: ${name}`,
          `包名不匹配：${name}`,
        ),
      };
    }
  } catch {
    return {
      ok: false,
      message: localizeDesktopText(
        locale,
        'manifest.json could not be read or is invalid.',
        'manifest.json 无法读取或格式无效。',
      ),
    };
  }
  return {
    ok: true,
    message: localizeDesktopText(
      locale,
      'Community Package files are complete.',
      'Community Package 文件完整。',
    ),
  };
};

const readCommunityPackageManifest = async (path: string) => {
  try {
    const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')) as {
      package_name?: string;
      name?: string;
      title?: string;
    };
    return manifest;
  } catch {
    return undefined;
  }
};

const isKnownCommunityPackage = async (path: string): Promise<boolean> => {
  const manifest = await readCommunityPackageManifest(path);
  if (!manifest) return false;
  const name = manifest.package_name ?? manifest.name;
  return name === packageName || (!name && manifest.title === packageTitle);
};

const communityPackageFilesMatch = async (sourcePath: string, targetPath: string) => {
  for (const relativePath of communityPackageFiles) {
    try {
      const [source, target] = await Promise.all([
        readFile(join(sourcePath, relativePath)),
        readFile(join(targetPath, relativePath)),
      ]);
      if (!source.equals(target)) return false;
    } catch {
      return false;
    }
  }
  return true;
};

type CommunityPackageValidation =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

const validateCommunityPackageSource = async (
  sourcePath: string,
): Promise<CommunityPackageValidation> => {
  const sourceCheck = await checkCommunityPackageFiles(sourcePath);
  if (!sourceCheck.ok) return { ok: false, message: sourceCheck.message };
  if (!(await isKnownCommunityPackage(sourcePath))) {
    return { ok: false, message: 'Community Package 标识不匹配。' };
  }
  return { ok: true };
};

const restoreCommunityPackageBackup = async (
  backupPath: string | undefined,
  targetPath: string,
) => {
  if (!backupPath || !(await exists(backupPath))) return;
  await rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
  try {
    await rename(backupPath, targetPath);
  } catch {
    await cp(backupPath, targetPath, { recursive: true });
    await rm(backupPath, { recursive: true, force: true });
  }
};

type CommunityPackageSyncResult = {
  status: 'installed' | 'already_current' | 'conflict' | 'failed';
  message: string;
};

const syncCommunityPackage = async (
  sourcePath: string,
  targetPath: string,
  backupDirectory: string,
): Promise<CommunityPackageSyncResult> => {
  const targetEntry = await lstat(targetPath).catch(() => undefined);
  if (targetEntry?.isSymbolicLink() || (targetEntry && !targetEntry.isDirectory())) {
    return {
      status: 'conflict',
      message: 'Community Package 目标路径已被非本应用目录占用，未覆盖。',
    };
  }

  if (targetEntry) {
    if (!(await isKnownCommunityPackage(targetPath))) {
      return {
        status: 'conflict',
        message: 'Community Package 目标目录不是本应用的 Bridge，未覆盖。',
      };
    }
    const existingCheck = await checkCommunityPackageFiles(targetPath);
    if (existingCheck.ok && (await communityPackageFilesMatch(sourcePath, targetPath))) {
      return {
        status: 'already_current',
        message: 'Community Package 已是当前版本。',
      };
    }
  }

  const targetParent = dirname(targetPath);
  const stagingPath = join(targetParent, `.${packageName}.staging-${randomUUID()}`);
  let backupPath: string | undefined;
  try {
    await mkdir(targetParent, { recursive: true });
    await mkdir(stagingPath, { recursive: true });
    for (const relativePath of communityPackageFiles) {
      const stagedPath = join(stagingPath, relativePath);
      await mkdir(dirname(stagedPath), { recursive: true });
      await copyFile(join(sourcePath, relativePath), stagedPath);
    }

    if (targetEntry) {
      await mkdir(backupDirectory, { recursive: true });
      backupPath = join(backupDirectory, `${packageName}-${Date.now()}-${randomUUID()}`);
      await cp(targetPath, backupPath, { recursive: true });
      await rm(targetPath, { recursive: true, force: true });
    }
    await rename(stagingPath, targetPath);
    return {
      status: 'installed',
      message: targetEntry ? 'Community Package 已更新。' : 'Community Package 已安装。',
    };
  } catch (error) {
    await restoreCommunityPackageBackup(backupPath, targetPath).catch(() => undefined);
    return {
      status: 'failed',
      message: `Community Package 安装失败：${String(error)}`,
    };
  } finally {
    await rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
  }
};

export async function installMsfsCommunityPackage(
  options: MsfsCommunityPackageInstallOptions,
): Promise<MsfsCommunityPackageInstallResult> {
  const sourceValidation = await validateCommunityPackageSource(options.sourcePath);
  if (!sourceValidation.ok) {
    return {
      status: 'source_invalid',
      message: `内置 MSFS Community Package 无效：${sourceValidation.message}`,
    };
  }

  const userConfig = await findMsfsUserConfig(
    options.userCfgCandidates ?? defaultMsfsUserConfigCandidates(),
  );
  if (!userConfig) {
    return {
      status: 'not_found',
      message: '未找到 MSFS 2024 的 UserCfg.opt，暂未安装 Community Package。',
    };
  }

  let activePackagePath: string;
  try {
    activePackagePath = resolveCommunityPackagePath(userConfig.installedPackagesPath);
  } catch (error) {
    return {
      status: 'failed',
      message: `Community2024 路径无效：${String(error)}`,
      userCfgPath: userConfig.path,
    };
  }

  const versionStoreRoot = resolveCommunityPath(
    userConfig.installedPackagesPath,
    versionStoreDirectory,
  );
  const versionStoreEntry = await lstat(versionStoreRoot).catch(() => undefined);
  const hasDeveloperVersionStore = Boolean(versionStoreEntry?.isDirectory());
  const versionStorePath = hasDeveloperVersionStore
    ? resolveMsfsCommunityVersionPath(userConfig.installedPackagesPath, 'application')
    : undefined;
  const targetPath = versionStorePath ?? activePackagePath;
  const targetResult = await syncCommunityPackage(
    options.sourcePath,
    targetPath,
    options.backupDirectory,
  );
  const context = {
    userCfgPath: userConfig.path,
    communityPackagePath: activePackagePath,
    ...(versionStorePath ? { versionStorePath } : {}),
  };

  if (targetResult.status === 'conflict' || targetResult.status === 'failed') {
    return {
      status: targetResult.status,
      message: targetResult.message,
      ...context,
    };
  }

  if (!versionStorePath) {
    return {
      status: targetResult.status,
      message: targetResult.message,
      ...context,
    };
  }

  const activateResult = await syncCommunityPackage(
    versionStorePath,
    activePackagePath,
    options.backupDirectory,
  );
  if (activateResult.status === 'conflict' || activateResult.status === 'failed') {
    return {
      status: activateResult.status,
      message: `应用版本已保存，但切换到当前启用目录失败：${activateResult.message}`,
      ...context,
    };
  }
  const changed = targetResult.status === 'installed' || activateResult.status === 'installed';
  return {
    status: changed ? 'installed' : 'already_current',
    message: changed
      ? '应用版本 Community Package 已更新并启用。'
      : '应用版本 Community Package 已是当前版本。',
    ...context,
  };
}

export async function activateMsfsCommunityVersion(
  options: MsfsCommunityPackageActivationOptions,
): Promise<MsfsCommunityPackageInstallResult> {
  const userConfig = await findMsfsUserConfig(
    options.userCfgCandidates ?? defaultMsfsUserConfigCandidates(),
  );
  if (!userConfig) {
    return {
      status: 'not_found',
      message: '未找到 MSFS 2024 的 UserCfg.opt。',
    };
  }

  const versionStorePath = resolveMsfsCommunityVersionPath(
    userConfig.installedPackagesPath,
    options.version,
  );
  if (options.sourcePath) {
    const sourceValidation = await validateCommunityPackageSource(options.sourcePath);
    if (!sourceValidation.ok) {
      return {
        status: 'source_invalid',
        message: `${versionStoreNames[options.version]} Community Package 无效：${sourceValidation.message}`,
        userCfgPath: userConfig.path,
        versionStorePath,
      };
    }
    const storeResult = await syncCommunityPackage(
      options.sourcePath,
      versionStorePath,
      options.backupDirectory,
    );
    if (storeResult.status === 'conflict' || storeResult.status === 'failed') {
      return {
        status: storeResult.status,
        message: storeResult.message,
        userCfgPath: userConfig.path,
        versionStorePath,
      };
    }
  } else if (!(await exists(versionStorePath))) {
    return {
      status: 'not_found',
      message: `未找到${versionStoreNames[options.version]} Community Package。`,
      userCfgPath: userConfig.path,
      versionStorePath,
    };
  }

  const storeValidation = await validateCommunityPackageSource(versionStorePath);
  if (!storeValidation.ok) {
    return {
      status: 'source_invalid',
      message: `${versionStoreNames[options.version]} Community Package 无效：${storeValidation.message}`,
      userCfgPath: userConfig.path,
      versionStorePath,
    };
  }

  const activePackagePath = resolveCommunityPackagePath(userConfig.installedPackagesPath);
  const activeResult = await syncCommunityPackage(
    versionStorePath,
    activePackagePath,
    options.backupDirectory,
  );
  return {
    status: activeResult.status,
    message:
      activeResult.status === 'already_current'
        ? `${versionStoreNames[options.version]}已处于启用状态。`
        : `${versionStoreNames[options.version]}${activeResult.message}`,
    userCfgPath: userConfig.path,
    communityPackagePath: activePackagePath,
    versionStorePath,
  };
}

export function defaultMsfsUserConfigCandidates(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates: string[] = [];
  const appData = environment.APPDATA?.trim();
  const localAppData = environment.LOCALAPPDATA?.trim();
  if (appData) candidates.push(join(appData, 'Microsoft Flight Simulator 2024', 'UserCfg.opt'));
  if (localAppData) {
    candidates.push(
      join(
        localAppData,
        'Packages',
        'Microsoft.Limitless_8wekyb3d8bbwe',
        'LocalCache',
        'UserCfg.opt',
      ),
    );
  }
  return [...new Set(candidates)];
}

export class MsfsConfigurationChecker {
  private readonly client: MsfsCliClient;

  constructor(private readonly options: MsfsDiagnosticsOptions) {
    this.client =
      options.client ??
      new MsfsCliClient({
        executablePath: options.executablePath,
        timeoutMs: options.timeoutMs,
        maxConcurrency: options.maxConcurrency,
      });
  }

  private text(english: string, chinese: string): string {
    return localizeDesktopText(this.options.locale ?? 'zh-CN', english, chinese);
  }

  async check(signal?: AbortSignal): Promise<MsfsConfigurationDiagnostic> {
    const checks: MsfsDiagnosticCheck[] = [];
    const checkedAt = new Date().toISOString();
    const cliPath = this.options.executablePath;
    const daemonPath = join(dirname(cliPath), 'msfsd.exe');
    const cliExists = await exists(cliPath);
    const daemonExists = await exists(daemonPath);
    if (!cliExists || !daemonExists) {
      checks.push(
        check(
          'cli_runtime',
          'error',
          this.text('MSFS CLI runtime files are incomplete.', 'MSFS CLI 运行文件不完整。'),
          [
            !cliExists ? this.text('Missing msfs.exe', '缺少 msfs.exe') : '',
            !daemonExists ? this.text('Missing msfsd.exe', '缺少 msfsd.exe') : '',
          ]
            .filter(Boolean)
            .join(this.options.locale === 'en-US' ? '; ' : '；'),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: this.text('MSFS CLI runtime files are incomplete.', 'MSFS CLI 运行文件不完整。'),
        checks,
        cliPath,
        checkedAt,
      });
    }
    checks.push(
      check(
        'cli_runtime',
        'ok',
        this.text('MSFS CLI runtime files are complete.', 'MSFS CLI 运行文件完整。'),
        cliPath,
      ),
    );

    const status = await this.client.execute(['status'], statusDataSchema, signal);
    const simulatorState = await this.client.execute(
      ['system', 'state', '--name', 'AircraftLoaded'],
      systemStateDataSchema,
      signal,
    );
    const connected =
      (status.status === 'ok' && status.data.simconnect.connected) ||
      simulatorState.status === 'ok';
    if (status.status !== 'ok') {
      checks.push(
        check(
          'simconnect',
          connected ? 'ok' : 'warning',
          connected
            ? this.text('MSFS is connected.', 'MSFS 游戏已连接。')
            : this.text('MSFS is not currently connected.', 'MSFS 游戏当前未连接。'),
          status.message,
        ),
      );
    } else if (connected) {
      checks.push(
        check(
          'simconnect',
          'ok',
          this.text('MSFS is connected through SimConnect.', 'MSFS 已通过 SimConnect 连接。'),
        ),
      );
    } else {
      checks.push(
        check(
          'simconnect',
          'warning',
          this.text('MSFS is not currently connected.', 'MSFS 游戏当前未连接。'),
        ),
      );
    }

    const userConfig = await findMsfsUserConfig(
      this.options.userCfgCandidates ?? defaultMsfsUserConfigCandidates(),
    );
    if (!userConfig) {
      checks.push(
        check(
          'user_config',
          'error',
          this.text('MSFS 2024 UserCfg.opt was not found.', '未找到 MSFS 2024 的 UserCfg.opt。'),
        ),
      );
      checks.push(
        check(
          'community_package',
          'warning',
          this.text(
            'The Community2024 directory could not be located.',
            '无法定位 Community2024 目录。',
          ),
        ),
      );
      checks.push(
        check(
          'route_bridge',
          'warning',
          this.text(
            'Locate Community2024 before validating the EFB Bridge.',
            '需要先定位 Community2024 后再验证 EFB Bridge。',
          ),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: this.text(
          'The MSFS 2024 game configuration path was not found.',
          '未找到 MSFS 2024 的游戏配置路径。',
        ),
        checks,
        cliPath,
        checkedAt,
      });
    }
    checks.push(
      check(
        'user_config',
        'ok',
        this.text('The MSFS 2024 game configuration was found.', '已找到 MSFS 2024 的游戏配置。'),
        userConfig.path,
      ),
    );

    let communityPackagePath: string;
    try {
      communityPackagePath = resolveCommunityPackagePath(userConfig.installedPackagesPath);
    } catch (error) {
      checks.push(
        check(
          'community_package',
          'error',
          this.text('The Community2024 path is invalid.', 'Community2024 路径无效。'),
          localizeMsfsDiagnosticDetail(String(error), this.options.locale ?? 'zh-CN'),
        ),
      );
      checks.push(
        check(
          'route_bridge',
          'warning',
          this.text('The EFB Bridge could not be validated.', '无法验证 EFB Bridge。'),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: this.text(
          'The MSFS Community2024 configuration path is invalid.',
          'MSFS Community2024 配置路径无效。',
        ),
        checks,
        cliPath,
        userCfgPath: userConfig.path,
        checkedAt,
      });
    }

    const packageFiles = await checkCommunityPackageFiles(
      communityPackagePath,
      this.options.locale ?? 'zh-CN',
    );
    if (!packageFiles.ok) {
      checks.push(
        check(
          'community_package',
          'error',
          this.text(
            'The complete MSFS 2024 Community Package was not found.',
            '未找到完整的 MSFS 2024 Community Package。',
          ),
          packageFiles.message,
        ),
      );
      checks.push(
        check(
          'route_bridge',
          'warning',
          this.text('The EFB Route Bridge files are incomplete.', 'EFB Route Bridge 文件不完整。'),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: this.text(
          'The EFB Route Bridge is not fully configured.',
          'EFB Route Bridge 尚未完成配置。',
        ),
        checks,
        cliPath,
        userCfgPath: userConfig.path,
        communityPackagePath,
        checkedAt,
      });
    }
    checks.push(
      check(
        'community_package',
        'ok',
        this.text('Community Package files are complete.', 'Community Package 文件完整。'),
        communityPackagePath,
      ),
    );

    if (!connected) {
      checks.push(
        check(
          'route_bridge',
          'warning',
          this.text(
            'The game is not running, so the Bridge cannot be validated yet.',
            '游戏未启动，暂时无法验证 Bridge 是否已被加载。',
          ),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'game_not_running',
        message: this.text(
          'The CLI and Community Package are configured. Start MSFS for final validation.',
          'CLI 与 Community Package 已配置，请启动 MSFS 进行最终验证。',
        ),
        checks,
        cliPath,
        userCfgPath: userConfig.path,
        communityPackagePath,
        checkedAt,
      });
    }

    const route = await this.client.execute(
      ['route', 'get', '--source', 'efb'],
      routeDataSchema,
      signal,
    );
    const routeCode = resultCode(route);
    if (route.status === 'ok' || routeCode === 'ROUTE_NOT_FOUND') {
      checks.push(
        check(
          'route_bridge',
          'ok',
          routeCode === 'ROUTE_NOT_FOUND'
            ? this.text(
                'The EFB Route Bridge is loaded, but no route is set.',
                'EFB Route Bridge 已加载，但当前没有设置航路。',
              )
            : this.text(
                'The EFB Route Bridge is loaded and ready.',
                'EFB Route Bridge 已加载且可用。',
              ),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'ready',
        message: this.text(
          'The MSFS CLI and game integration are fully configured.',
          'MSFS CLI 与游戏项目配置已完成。',
        ),
        checks,
        cliPath,
        userCfgPath: userConfig.path,
        communityPackagePath,
        checkedAt,
      });
    }

    checks.push(
      check(
        'route_bridge',
        'warning',
        this.text(
          'The Community Package was found, but the game has not loaded the EFB Route Bridge.',
          'Community Package 已找到，但游戏尚未加载 EFB Route Bridge。',
        ),
        routeCode === 'ROUTE_TIMEOUT'
          ? this.text('Exit and restart MSFS.', '请退出并重新启动 MSFS。')
          : route?.message,
      ),
    );
    return msfsConfigurationDiagnosticSchema.parse({
      status: 'needs_setup',
      message: this.text(
        'The EFB Route Bridge is not active in the game. Restart MSFS and try again.',
        'EFB Route Bridge 尚未在游戏中生效，请重启 MSFS 后重试。',
      ),
      checks,
      cliPath,
      userCfgPath: userConfig.path,
      communityPackagePath,
      checkedAt,
    });
  }
}
