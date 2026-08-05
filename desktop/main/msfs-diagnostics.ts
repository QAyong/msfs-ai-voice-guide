import { access, readFile } from 'node:fs/promises';
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

const packageName = 'msfs-native-cli-route-bridge';

export type MsfsDiagnosticsOptions = {
  executablePath: string;
  timeoutMs: number;
  maxConcurrency: number;
  userCfgCandidates?: readonly string[];
  packageSourcePath?: string;
  client?: MsfsCliClient;
};

export type MsfsUserConfig = {
  path: string;
  installedPackagesPath: string;
};

const exists = async (path: string): Promise<boolean> =>
  access(path, constants.F_OK)
    .then(() => true)
    .catch(() => false);

export function parseInstalledPackagesPath(contents: string): string | undefined {
  const match = contents.match(/InstalledPackagesPath\s+"([^"]+)"/iu);
  return match?.[1]?.trim() || undefined;
}

export function resolveCommunityPackagePath(
  installedPackagesPath: string,
  packageDirectory = packageName,
): string {
  const communityRoot = resolve(installedPackagesPath, 'Community2024');
  const target = resolve(communityRoot, packageDirectory);
  const normalizedRoot = `${normalize(communityRoot)}${sep}`.toLowerCase();
  const normalizedTarget = normalize(target).toLowerCase();
  if (
    normalizedTarget !== normalize(communityRoot).toLowerCase() &&
    !normalizedTarget.startsWith(normalizedRoot)
  ) {
    throw new Error('Community Package 路径不在 Community2024 目录内。');
  }
  return target;
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

const checkCommunityPackageFiles = async (
  path: string,
): Promise<{ ok: boolean; message: string }> => {
  const required = [
    join(path, 'manifest.json'),
    join(path, 'layout.json'),
    join(path, 'modules', 'msfs-route-bridge.wasm'),
  ];
  const missing: string[] = [];
  for (const file of required) {
    if (!(await exists(file))) missing.push(file.slice(path.length + 1));
  }
  if (missing.length > 0) return { ok: false, message: `缺少文件：${missing.join('、')}` };

  try {
    const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8')) as {
      package_name?: string;
      name?: string;
    };
    const name = manifest.package_name ?? manifest.name;
    if (name && name !== packageName) {
      return { ok: false, message: `包名不匹配：${name}` };
    }
  } catch {
    return { ok: false, message: 'manifest.json 无法读取或格式无效。' };
  }
  return { ok: true, message: 'Community Package 文件完整。' };
};

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
          'MSFS CLI 运行文件不完整。',
          [!cliExists ? '缺少 msfs.exe' : '', !daemonExists ? '缺少 msfsd.exe' : '']
            .filter(Boolean)
            .join('；'),
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: 'MSFS CLI 运行文件不完整。',
        checks,
        cliPath,
        checkedAt,
      });
    }
    checks.push(check('cli_runtime', 'ok', 'MSFS CLI 运行文件完整。', cliPath));

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
          connected ? 'MSFS 游戏已连接。' : 'MSFS 游戏当前未连接。',
          status.message,
        ),
      );
    } else if (connected) {
      checks.push(check('simconnect', 'ok', 'MSFS 已通过 SimConnect 连接。'));
    } else {
      checks.push(check('simconnect', 'warning', 'MSFS 游戏当前未连接。'));
    }

    const userConfig = await findMsfsUserConfig(
      this.options.userCfgCandidates ?? defaultMsfsUserConfigCandidates(),
    );
    if (!userConfig) {
      checks.push(check('user_config', 'error', '未找到 MSFS 2024 的 UserCfg.opt。'));
      checks.push(check('community_package', 'warning', '无法定位 Community2024 目录。'));
      checks.push(
        check('route_bridge', 'warning', '需要先定位 Community2024 后再验证 EFB Bridge。'),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: '未找到 MSFS 2024 的游戏配置路径。',
        checks,
        cliPath,
        checkedAt,
      });
    }
    checks.push(check('user_config', 'ok', '已找到 MSFS 2024 的游戏配置。', userConfig.path));

    let communityPackagePath: string;
    try {
      communityPackagePath = resolveCommunityPackagePath(userConfig.installedPackagesPath);
    } catch (error) {
      checks.push(check('community_package', 'error', 'Community2024 路径无效.', String(error)));
      checks.push(check('route_bridge', 'warning', '无法验证 EFB Bridge。'));
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: 'MSFS Community2024 配置路径无效。',
        checks,
        cliPath,
        userCfgPath: userConfig.path,
        checkedAt,
      });
    }

    const packageFiles = await checkCommunityPackageFiles(communityPackagePath);
    if (!packageFiles.ok) {
      checks.push(
        check(
          'community_package',
          'error',
          '未找到完整的 MSFS 2024 Community Package。',
          packageFiles.message,
        ),
      );
      checks.push(check('route_bridge', 'warning', 'EFB Route Bridge 文件不完整。'));
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'needs_setup',
        message: 'EFB Route Bridge 尚未完成配置。',
        checks,
        cliPath,
        userCfgPath: userConfig.path,
        communityPackagePath,
        checkedAt,
      });
    }
    checks.push(
      check('community_package', 'ok', 'Community Package 文件完整。', communityPackagePath),
    );

    if (!connected) {
      checks.push(
        check('route_bridge', 'warning', '游戏未启动，暂时无法验证 Bridge 是否已被加载。'),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'game_not_running',
        message: 'CLI 与 Community Package 已配置，请启动 MSFS 进行最终验证。',
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
            ? 'EFB Route Bridge 已加载，但当前没有设置航路。'
            : 'EFB Route Bridge 已加载且可用。',
        ),
      );
      return msfsConfigurationDiagnosticSchema.parse({
        status: 'ready',
        message: 'MSFS CLI 与游戏项目配置已完成。',
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
        'Community Package 已找到，但游戏尚未加载 EFB Route Bridge。',
        routeCode === 'ROUTE_TIMEOUT' ? '请退出并重新启动 MSFS。' : route?.message,
      ),
    );
    return msfsConfigurationDiagnosticSchema.parse({
      status: 'needs_setup',
      message: 'EFB Route Bridge 尚未在游戏中生效，请重启 MSFS 后重试。',
      checks,
      cliPath,
      userCfgPath: userConfig.path,
      communityPackagePath,
      checkedAt,
    });
  }
}
