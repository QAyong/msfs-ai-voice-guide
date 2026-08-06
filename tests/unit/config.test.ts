import {
  ConfigError,
  loadConfig,
  loadLlmConfig,
  loadMsfsConfig,
  loadSearchConfig,
} from '../../src/config/schema.js';
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
  it('探索规划只要求 DeepSeek 配置，不依赖语音或 LiveKit', () => {
    expect(
      loadLlmConfig({
        DEEPSEEK_API_KEY: 'explore-secret',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
        DEEPSEEK_LLM_MODEL: 'deepseek-chat',
      }),
    ).toEqual({
      provider: 'deepseek',
      apiKey: 'explore-secret',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    });
  });

  it('MSFS 探索上下文使用独立默认值，不依赖 AI 服务配置', () => {
    expect(loadMsfsConfig({})).toEqual({
      timeoutMs: 15_000,
      maxConcurrency: 2,
      trackIntervalMs: 3_000,
      trackMaximumPoints: 120,
    });
  });

  it('缺少 Agent 名称时使用应用内默认值', () => {
    const environment = { ...baseEnvironment };
    delete environment.LIVEKIT_AGENT_NAME;

    expect(loadConfig(environment).livekit.agentName).toBe('msfs-voice-guide');
  });

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
      provider: 'volcengine',
      apiKey: 'search-secret',
      endpoint: 'https://open.feedcoopapi.com/search_api/web_search',
      timeoutMs: 10_000,
    });
  });

  it('按选择的服务商解析博查搜索配置', () => {
    const config = loadConfig({
      ...baseEnvironment,
      SEARCH_PROVIDER: 'bocha',
      BOCHA_SEARCH_API_KEY: 'bocha-secret',
    });

    expect(config.search).toEqual({
      provider: 'bocha',
      apiKey: 'bocha-secret',
      endpoint: 'https://api.bochaai.com/v1/web-search',
      timeoutMs: 10_000,
    });
  });

  it('为 MSFS CLI 提供受限的进程和轨迹配置', () => {
    const config = loadConfig({ ...baseEnvironment, MSFS_CLI_PATH: 'tools/msfs.exe' });

    expect(config.msfs).toEqual({
      cliPath: 'tools/msfs.exe',
      timeoutMs: 15_000,
      maxConcurrency: 2,
      trackIntervalMs: 3_000,
      trackMaximumPoints: 120,
    });
    expect(() => loadConfig({ ...baseEnvironment, MSFS_CLI_MAX_CONCURRENCY: '99' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ ...baseEnvironment, MSFS_TRACK_INTERVAL_MS: '10' })).toThrow(
      ConfigError,
    );
  });

  it('可为独立 CLI 只加载搜索配置', () => {
    expect(loadSearchConfig({ VOLCENGINE_SEARCH_API_KEY: 'search-secret' })).toEqual({
      provider: 'volcengine',
      apiKey: 'search-secret',
      endpoint: 'https://open.feedcoopapi.com/search_api/web_search',
      timeoutMs: 10_000,
    });
  });

  it('独立 CLI 可加载博查搜索配置', () => {
    expect(
      loadSearchConfig({ SEARCH_PROVIDER: 'bocha', BOCHA_SEARCH_API_KEY: 'bocha-secret' }),
    ).toEqual({
      provider: 'bocha',
      apiKey: 'bocha-secret',
      endpoint: 'https://api.bochaai.com/v1/web-search',
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
