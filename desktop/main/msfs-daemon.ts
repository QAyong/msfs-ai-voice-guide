import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const defaultStopTimeoutMs = 5_000;
export type MsfsDaemonRole = 'monitor' | 'ai';

const forceStopMsfsDaemon = (): Promise<void> => {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('taskkill.exe', ['/F', '/IM', 'msfsd.exe'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      if (!child.killed) child.kill();
      resolve();
    }, defaultStopTimeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once('error', finish);
    child.once('close', finish);
  });
};

/**
 * Ask the native MSFS CLI daemon to exit without starting it when it is absent.
 * The CLI command is intentionally best-effort during application shutdown.
 */
export function stopMsfsDaemon(
  executablePath: string,
  role: MsfsDaemonRole = 'ai',
  timeoutMs = defaultStopTimeoutMs,
): Promise<void> {
  if (!existsSync(executablePath)) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (force = false) => {
      if (settled) return;
      settled = true;
      if (force) {
        void forceStopMsfsDaemon().finally(resolve);
        return;
      }
      resolve();
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executablePath, ['daemon', 'stop', '--role', role, '--json'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      finish();
      return;
    }

    const timer = setTimeout(() => {
      if (!child.killed) child.kill();
      finish(true);
    }, timeoutMs);

    child.once('error', () => {
      clearTimeout(timer);
      finish(true);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      finish(code !== 0);
    });
  });
}
