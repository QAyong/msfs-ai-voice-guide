import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const inheritedEnvironment = new Map(Object.entries(process.env));
const locallyLoadedKeys = new Set<string>();

export function getInheritedEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(inheritedEnvironment);
}

export function reloadLocalEnvironment(path: string): void {
  for (const key of locallyLoadedKeys) {
    if (!inheritedEnvironment.has(key)) delete process.env[key];
  }
  locallyLoadedKeys.clear();

  if (!existsSync(path)) return;
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (inheritedEnvironment.has(key)) continue;
    process.env[key] = value;
    locallyLoadedKeys.add(key);
  }
}

export function ensureLocalEnvironmentFile(path: string, examplePath: string): void {
  if (!existsSync(path)) copyFileSync(examplePath, path);
}
