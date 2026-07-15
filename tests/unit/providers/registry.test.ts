import { loadConfig } from '../../../src/config/schema.js';
import { createVoiceProviders } from '../../../src/providers/registry.js';
import { describe, expect, it } from 'vitest';

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

describe('createVoiceProviders', () => {
  it('集中创建 DeepSeek LLM 与豆包 STT/TTS', async () => {
    const providers = createVoiceProviders(config);

    expect(providers.llm.provider).toBe('deepseek.example.test');
    expect(providers.stt.label).toBe('volcengine.STT');
    expect(providers.tts.label).toBe('volcengine.TTS');

    await Promise.all([providers.llm.aclose(), providers.stt.close(), providers.tts.close()]);
  });
});
