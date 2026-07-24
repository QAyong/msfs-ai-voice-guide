import { isAbsolute, join, resolve } from 'node:path';

export type MsfsPathOptions = {
  configuredPath?: string;
  resourcesPath?: string;
  cwd?: string;
};

export function resolveMsfsCliPath(options: MsfsPathOptions): string {
  if (options.configuredPath) {
    return isAbsolute(options.configuredPath)
      ? options.configuredPath
      : resolve(options.cwd ?? process.cwd(), options.configuredPath);
  }
  if (options.resourcesPath) return join(options.resourcesPath, 'msfs', 'msfs.exe');
  return resolve(options.cwd ?? process.cwd(), 'resources', 'msfs', 'msfs.exe');
}
