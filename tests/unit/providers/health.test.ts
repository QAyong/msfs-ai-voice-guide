import { loadConfig } from '../../../src/config/schema.js';
import { checkProviderConfiguration } from '../../../src/providers/health.js';
import { describe, expect, it } from 'vitest';

describe('checkProviderConfiguration', () => {
  it('只报告配置状态，不回显凭据', () => {
    const config = loadConfig({
      LIVEKIT_URL: 'wss://livekit.example.test',
      LIVEKIT_API_KEY: 'livekit-key',
      LIVEKIT_API_SECRET: 'livekit-secret',
      LIVEKIT_AGENT_NAME: 'msfs-voice-guide',
      DEEPSEEK_API_KEY: 'deepseek-secret',
      DEEPSEEK_BASE_URL: 'https://deepseek.example.test',
      DEEPSEEK_LLM_MODEL: 'deepseek-test-model',
      VOLCENGINE_SPEECH_APP_ID: 'speech-app',
      VOLCENGINE_SPEECH_ACCESS_TOKEN: 'speech-secret',
      VOLCENGINE_STT_ENDPOINT: 'wss://speech.example.test/asr',
      VOLCENGINE_STT_RESOURCE_ID: 'asr-resource',
      VOLCENGINE_TTS_ENDPOINT: 'wss://speech.example.test/tts',
      VOLCENGINE_TTS_RESOURCE_ID: 'tts-resource',
      VOLCENGINE_TTS_SPEAKER: 'speaker-id',
    });

    expect(JSON.stringify(checkProviderConfiguration(config))).not.toContain('secret');
  });
});
