import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTemplateEnvironmentValue, reloadLocalEnvironment } from '../../desktop/main/environment.js';

describe('desktop local environment', () => {
  it('recognizes template values without treating them as credentials', () => {
    expect(isTemplateEnvironmentValue('your_deepseek_api_key')).toBe(true);
    expect(isTemplateEnvironmentValue('wss://your-livekit-host')).toBe(true);
    expect(isTemplateEnvironmentValue('real-provider-value')).toBe(false);
  });

  it('does not load template credentials into the desktop process', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'msfs-env-test-'));
    const key = 'MSFS_TEST_TEMPLATE_VALUE';
    try {
      await writeFile(join(directory, '.env'), `${key}=your_example_value\n`, 'utf8');
      delete process.env[key];
      reloadLocalEnvironment(join(directory, '.env'));
      expect(process.env[key]).toBeUndefined();
    } finally {
      delete process.env[key];
      await rm(directory, { recursive: true, force: true });
    }
  });
});
