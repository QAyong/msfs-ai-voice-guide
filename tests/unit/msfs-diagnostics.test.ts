import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import {
  MsfsConfigurationChecker,
  activateMsfsCommunityVersion,
  installMsfsCommunityPackage,
  parseInstalledPackagesPath,
  resolveCommunityPackagePath,
  resolveMsfsCommunityVersionPath,
} from '../../desktop/main/msfs-diagnostics.js';
import type {
  MsfsProcessRunner,
  ProcessRunResult,
  ProcessWatchHandle,
} from '../../src/msfs/process-runner.js';

class FakeRunner implements MsfsProcessRunner {
  constructor(
    private readonly connected: boolean,
    private readonly routeNotFound: boolean,
  ) {}

  async run(...[, args]: Parameters<MsfsProcessRunner['run']>): Promise<ProcessRunResult> {
    if (args[0] === 'status') {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          id: 'status',
          ok: true,
          data: {
            daemon: 'ready',
            simconnect: { sdk_compiled: true, connected: this.connected, transport: 'SimConnect' },
            route_bridge: { transport: 'SimConnect CommBus', installed: 'unknown' },
          },
        }),
        stderr: '',
        timedOut: false,
      };
    }
    if (args[0] === 'system') {
      return {
        exitCode: this.connected ? 0 : 1,
        stdout: JSON.stringify(
          this.connected
            ? {
                id: 'system.state',
                ok: true,
                data: {
                  name: 'AircraftLoaded',
                  value: { integer: 0, float: 0, string: 'aircraft' },
                },
              }
            : {
                id: 'system.state',
                ok: false,
                error: { code: 'SIM_NOT_READY', message: 'not connected' },
              },
        ),
        stderr: '',
        timedOut: false,
      };
    }
    if (this.routeNotFound) {
      return {
        exitCode: 1,
        stdout: JSON.stringify({
          id: 'route',
          ok: false,
          error: { code: 'ROUTE_NOT_FOUND', message: 'no route' },
        }),
        stderr: '',
        timedOut: false,
      };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        id: 'route',
        ok: true,
        data: { source: 'efb', route: {} },
      }),
      stderr: '',
      timedOut: false,
    };
  }

  watch(): ProcessWatchHandle {
    return { completion: Promise.resolve(), stop: async () => undefined };
  }
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'msfs-diagnostic-'));
  const cliPath = join(root, 'msfs.exe');
  const daemonPath = join(root, 'msfsd.exe');
  await writeFile(cliPath, 'cli');
  await writeFile(daemonPath, 'daemon');
  const installedPackagesPath = join(root, 'packages');
  const userCfgPath = join(root, 'UserCfg.opt');
  const packagePath = join(installedPackagesPath, 'Community2024', 'msfs-native-cli-route-bridge');
  await mkdir(join(packagePath, 'modules'), { recursive: true });
  await writeFile(userCfgPath, `InstalledPackagesPath "${installedPackagesPath}"`);
  await writeFile(
    join(packagePath, 'manifest.json'),
    JSON.stringify({ package_name: 'msfs-native-cli-route-bridge' }),
  );
  await writeFile(join(packagePath, 'layout.json'), '{}');
  await writeFile(join(packagePath, 'modules', 'msfs-route-bridge.wasm'), 'wasm');
  return { root, cliPath, userCfgPath };
}

async function writeBridgePackage(path: string, wasmContents: string) {
  await mkdir(join(path, 'modules'), { recursive: true });
  await writeFile(
    join(path, 'manifest.json'),
    JSON.stringify({ title: 'MSFS Native CLI EFB Route Bridge', package_version: '0.1.0' }),
  );
  await writeFile(join(path, 'layout.json'), '{}');
  await writeFile(join(path, 'modules', 'msfs-route-bridge.wasm'), wasmContents);
}

describe('MSFS configuration diagnostics', () => {
  it('parses UserCfg.opt and keeps Community2024 paths constrained', () => {
    expect(parseInstalledPackagesPath('InstalledPackagesPath "C:\\Packages"')).toBe('C:\\Packages');
    expect(resolveCommunityPackagePath('C:\\Packages')).toBe(
      'C:\\Packages\\Community2024\\msfs-native-cli-route-bridge',
    );
    expect(() => resolveCommunityPackagePath('C:\\Packages', '..\\outside')).toThrow();
  });

  it('reports a complete package while the game is closed', async () => {
    const fixture = await createFixture();
    try {
      const checker = new MsfsConfigurationChecker({
        executablePath: fixture.cliPath,
        timeoutMs: 100,
        maxConcurrency: 1,
        locale: 'en-US',
        userCfgCandidates: [fixture.userCfgPath],
        client: new MsfsCliClient({
          executablePath: fixture.cliPath,
          timeoutMs: 100,
          maxConcurrency: 1,
          runner: new FakeRunner(false, false),
        }),
      });
      const result = await checker.check();
      expect(result.status).toBe('game_not_running');
      expect(result.message).toBe(
        'The CLI and Community Package are configured. Start MSFS for final validation.',
      );
      expect(result.checks.every((item) => !/\p{Script=Han}/u.test(item.message))).toBe(true);
      expect(result.checks.find((item) => item.id === 'community_package')?.status).toBe('ok');
      expect(result.checks.find((item) => item.id === 'route_bridge')?.status).toBe('warning');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('treats ROUTE_NOT_FOUND as a loaded and responsive bridge', async () => {
    const fixture = await createFixture();
    try {
      const checker = new MsfsConfigurationChecker({
        executablePath: fixture.cliPath,
        timeoutMs: 100,
        maxConcurrency: 1,
        userCfgCandidates: [fixture.userCfgPath],
        client: new MsfsCliClient({
          executablePath: fixture.cliPath,
          timeoutMs: 100,
          maxConcurrency: 1,
          runner: new FakeRunner(true, true),
        }),
      });
      const result = await checker.check();
      expect(result.status).toBe('ready');
      expect(result.checks.find((item) => item.id === 'route_bridge')?.status).toBe('ok');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('installs the bundled package idempotently and protects foreign packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-community-install-'));
    try {
      const sourcePath = join(root, 'source');
      const installedPackagesPath = join(root, 'packages');
      const userCfgPath = join(root, 'UserCfg.opt');
      const packagePath = resolveCommunityPackagePath(installedPackagesPath);
      await mkdir(join(sourcePath, 'modules'), { recursive: true });
      await writeFile(
        join(sourcePath, 'manifest.json'),
        JSON.stringify({ title: 'MSFS Native CLI EFB Route Bridge', package_version: '0.1.0' }),
      );
      await writeFile(join(sourcePath, 'layout.json'), '{}');
      await writeFile(join(sourcePath, 'modules', 'msfs-route-bridge.wasm'), 'wasm-v1');
      await writeFile(userCfgPath, `InstalledPackagesPath "${installedPackagesPath}"`);

      const first = await installMsfsCommunityPackage({
        sourcePath,
        userCfgCandidates: [userCfgPath],
        backupDirectory: join(root, 'backups'),
      });
      expect(first.status).toBe('installed');
      expect(await readFile(join(packagePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8')).toBe(
        'wasm-v1',
      );

      const second = await installMsfsCommunityPackage({
        sourcePath,
        userCfgCandidates: [userCfgPath],
        backupDirectory: join(root, 'backups'),
      });
      expect(second.status).toBe('already_current');

      await writeFile(
        join(packagePath, 'manifest.json'),
        JSON.stringify({ package_name: 'foreign-package' }),
      );
      const conflict = await installMsfsCommunityPackage({
        sourcePath,
        userCfgCandidates: [userCfgPath],
        backupDirectory: join(root, 'backups'),
      });
      expect(conflict.status).toBe('conflict');
      expect(await readFile(join(packagePath, 'manifest.json'), 'utf8')).toContain(
        'foreign-package',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps development and application versions separate while switching the active package', async () => {
    const root = await mkdtemp(join(tmpdir(), 'msfs-community-versions-'));
    try {
      const developmentSourcePath = join(root, 'development-source');
      const applicationSourcePath = join(root, 'application-source');
      const installedPackagesPath = join(root, 'packages');
      const userCfgPath = join(root, 'UserCfg.opt');
      const backupDirectory = join(root, 'backups');
      await writeBridgePackage(developmentSourcePath, 'development');
      await writeBridgePackage(applicationSourcePath, 'application');
      await writeFile(userCfgPath, `InstalledPackagesPath "${installedPackagesPath}"`);

      const development = await activateMsfsCommunityVersion({
        version: 'development',
        sourcePath: developmentSourcePath,
        userCfgCandidates: [userCfgPath],
        backupDirectory,
      });
      expect(development.status).toBe('installed');

      const activePath = resolveCommunityPackagePath(installedPackagesPath);
      const developmentStorePath = resolveMsfsCommunityVersionPath(
        installedPackagesPath,
        'development',
      );
      expect(await readFile(join(activePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8')).toBe(
        'development',
      );
      expect(
        await readFile(join(developmentStorePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8'),
      ).toBe('development');

      const application = await installMsfsCommunityPackage({
        sourcePath: applicationSourcePath,
        userCfgCandidates: [userCfgPath],
        backupDirectory,
      });
      expect(application.status).toBe('installed');
      const applicationStorePath = resolveMsfsCommunityVersionPath(
        installedPackagesPath,
        'application',
      );
      expect(await readFile(join(activePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8')).toBe(
        'application',
      );
      expect(
        await readFile(join(applicationStorePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8'),
      ).toBe('application');
      expect(
        await readFile(join(developmentStorePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8'),
      ).toBe('development');

      const restoredDevelopment = await activateMsfsCommunityVersion({
        version: 'development',
        sourcePath: developmentSourcePath,
        userCfgCandidates: [userCfgPath],
        backupDirectory,
      });
      expect(restoredDevelopment.status).toBe('installed');
      expect(await readFile(join(activePath, 'modules', 'msfs-route-bridge.wasm'), 'utf8')).toBe(
        'development',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
