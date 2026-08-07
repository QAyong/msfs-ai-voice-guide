import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const bundledGeoConfigSchema = z.object({
  MSFS_GEO_BACKEND: z.string().trim().min(1).default('cloud'),
  MSFS_GEO_CLOUD_BASE_URL: z.string().url(),
  MSFS_GEO_API_KEY: z.string().trim().min(1),
  MSFS_GEO_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(5),
});

const bundledGeoConfigPaths = (resourcesPath?: string, cwd = process.cwd()) =>
  [
    resourcesPath ? join(resourcesPath, 'msfs', 'geo-config.json') : undefined,
    join(cwd, 'out', 'msfs', 'geo-config.json'),
    join(cwd, 'dev-runtime', 'msfs-cli', 'geo-config.json'),
    join(cwd, 'resources', 'msfs', 'geo-config.json'),
  ].filter((path): path is string => Boolean(path));

export function applyBundledGeoEnvironment(
  resourcesPath?: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  const configPath = bundledGeoConfigPaths(resourcesPath).find((path) => existsSync(path));
  if (!configPath) return false;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return false;
  }

  const parsed = bundledGeoConfigSchema.safeParse(raw);
  if (!parsed.success) return false;

  for (const [key, value] of Object.entries(parsed.data)) {
    if (!environment[key]?.trim()) environment[key] = String(value);
  }
  return true;
}
