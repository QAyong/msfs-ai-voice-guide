import { ConfigError, loadConfig, loadSearchConfig } from '../../src/config/schema.js';
import { describe, expect, it } from 'vitest';

const baseEnvironment: NodeJS.ProcessEnv = {
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
  VOLCENGINE_SEARCH_API_KEY: 'search-secret',
};

describe('loadConfig', () => {
  it('使用 Speech API Key 并保留 App ID/Token 供 TTS 使用', () => {
    const config = loadConfig({ ...baseEnvironment, VOLCENGINE_SPEECH_API_KEY: 'speech-api-key' });

    expect(config.volcengine.stt.apiKey).toBe('speech-api-key');
    expect(config.volcengine.tts.appId).toBe('speech-app');
    expect(config.volcengine.stt.sampleRate).toBe(16_000);
  });

  it('为可选 STT 配置提供安全默认值', () => {
    const config = loadConfig(baseEnvironment);

    expect(config.volcengine.stt.model).toBe('bigmodel');
    expect(config.volcengine.stt.language).toBe('zh');
    expect(config.volcengine.tts.sampleRate).toBe(24_000);
  });

  it('解析 DeepSeek LLM 配置', () => {
    const config = loadConfig(baseEnvironment);

    expect(config.llm).toEqual({
      provider: 'deepseek',
      apiKey: 'deepseek-secret',
      baseUrl: 'https://deepseek.example.test',
      model: 'deepseek-test-model',
    });
  });

  it('为搜索服务解析连接配置与默认超时', () => {
    const config = loadConfig(baseEnvironment);

    expect(config.search).toEqual({
      apiKey: 'search-secret',
      endpoint: 'https://open.feedcoopapi.com/search_api/web_search',
      timeoutMs: 10_000,
    });
  });

  it('可为独立 CLI 只加载搜索配置', () => {
    expect(loadSearchConfig({ VOLCENGINE_SEARCH_API_KEY: 'search-secret' })).toEqual({
      apiKey: 'search-secret',
      endpoint: 'https://open.feedcoopapi.com/search_api/web_search',
      timeoutMs: 10_000,
    });
  });

  it('配置错误不会回显密钥值', () => {
    expect(() =>
      loadConfig({ ...baseEnvironment, LIVEKIT_URL: 'https://not-websocket.example.test' }),
    ).toThrow(ConfigError);

    try {
      loadConfig({ ...baseEnvironment, LIVEKIT_URL: 'https://not-websocket.example.test' });
    } catch (error) {
      expect(String(error)).not.toContain('livekit-secret');
      expect(String(error)).not.toContain('deepseek-secret');
    }
  });
});
