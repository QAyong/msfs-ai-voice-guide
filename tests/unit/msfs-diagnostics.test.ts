import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import {
  MsfsConfigurationChecker,
  parseInstalledPackagesPath,
  resolveCommunityPackagePath,
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
});
