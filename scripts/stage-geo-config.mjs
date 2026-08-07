import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(process.argv[2] ?? join(projectRoot, 'out', 'msfs'));

try {
  process.loadEnvFile(resolve(projectRoot, '.env'));
} catch {
  // The build environment may provide Geo values directly.
}

const baseUrl = process.env.MSFS_GEO_CLOUD_BASE_URL?.trim();
const apiKey = process.env.MSFS_GEO_API_KEY?.trim();
if (!baseUrl || !apiKey) {
  const missing = [
    !baseUrl ? 'MSFS_GEO_CLOUD_BASE_URL' : undefined,
    !apiKey ? 'MSFS_GEO_API_KEY' : undefined,
  ].filter(Boolean);
  throw new Error(`内置 Geo 配置缺少：${missing.join('、')}`);
}

const timeoutSeconds = Number(process.env.MSFS_GEO_TIMEOUT_SECONDS ?? 5);
if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
  throw new Error('MSFS_GEO_TIMEOUT_SECONDS 必须是正整数。');
}

const config = {
  MSFS_GEO_BACKEND: process.env.MSFS_GEO_BACKEND?.trim() || 'cloud',
  MSFS_GEO_CLOUD_BASE_URL: baseUrl,
  MSFS_GEO_API_KEY: apiKey,
  MSFS_GEO_TIMEOUT_SECONDS: timeoutSeconds,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, 'geo-config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
  'utf8',
);
console.log(`Geo 配置已暂存：${join(outputDirectory, 'geo-config.json')}`);
