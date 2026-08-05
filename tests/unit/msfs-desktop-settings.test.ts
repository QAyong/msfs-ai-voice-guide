import { describe, expect, it } from 'vitest';
import {
  defaultDesktopToolSettings,
  desktopSettingsSaveRequestSchema,
  parseDesktopToolSettingsEnvironment,
} from '../../shared/desktop-settings.js';

describe('MSFS desktop tool settings', () => {
  it('keeps all tools enabled when the environment setting is missing or invalid', () => {
    expect(parseDesktopToolSettingsEnvironment()).toEqual(defaultDesktopToolSettings);
    expect(parseDesktopToolSettingsEnvironment('{invalid')).toEqual(defaultDesktopToolSettings);
  });

  it('accepts a saved settings request without tools for backwards compatibility', () => {
    const result = desktopSettingsSaveRequestSchema.safeParse({
      locale: 'zh-CN',
      services: {
        llm: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
        stt: {
          endpoint: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
          resourceId: 'volc.bigasr.sauc.duration',
          model: 'bigmodel',
        },
        tts: {
          endpoint: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
          resourceId: 'seed-tts-2.0',
          speaker: 'zh_female_vv_uranus_bigtts',
          sampleRate: 24_000,
        },
        search: { provider: 'volcengine' },
      },
      credentials: {},
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tools).toEqual(defaultDesktopToolSettings);
  });
});
