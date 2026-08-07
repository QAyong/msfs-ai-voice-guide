import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBundledGeoEnvironment } from '../../src/config/bundled-geo.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('applyBundledGeoEnvironment', () => {
  it('loads packaged Geo values without replacing an existing environment value', async () => {
    const resourcesPath = await mkdtemp(join(tmpdir(), 'msfs-geo-'));
    temporaryDirectories.push(resourcesPath);
    await mkdir(join(resourcesPath, 'msfs'));
    await writeFile(
      join(resourcesPath, 'msfs', 'geo-config.json'),
      JSON.stringify({
        MSFS_GEO_BACKEND: 'cloud',
        MSFS_GEO_CLOUD_BASE_URL: 'https://geo.example.test',
        MSFS_GEO_API_KEY: 'bundled-key',
        MSFS_GEO_TIMEOUT_SECONDS: 5,
      }),
    );

    const environment: NodeJS.ProcessEnv = { MSFS_GEO_API_KEY: 'existing-key' };
    expect(applyBundledGeoEnvironment(resourcesPath, environment)).toBe(true);
    expect(environment).toMatchObject({
      MSFS_GEO_BACKEND: 'cloud',
      MSFS_GEO_CLOUD_BASE_URL: 'https://geo.example.test',
      MSFS_GEO_API_KEY: 'existing-key',
      MSFS_GEO_TIMEOUT_SECONDS: '5',
    });
  });
});
