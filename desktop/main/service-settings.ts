import type { AppConfig } from '../../src/config/schema.js';
import {
  defaultDesktopServiceSettings,
  type DesktopServiceSettings,
  type ServiceCredentialKey,
  type StoredServiceCredentials,
} from '../../shared/desktop-settings.js';

const providerEnvironmentKeys = [
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_LLM_MODEL',
  'VOLCENGINE_SPEECH_APP_ID',
  'VOLCENGINE_SPEECH_ACCESS_TOKEN',
  'VOLCENGINE_STT_ENDPOINT',
  'VOLCENGINE_STT_RESOURCE_ID',
  'VOLCENGINE_STT_MODEL',
  'VOLCENGINE_TTS_ENDPOINT',
  'VOLCENGINE_TTS_RESOURCE_ID',
  'VOLCENGINE_TTS_SPEAKER',
  'VOLCENGINE_TTS_SAMPLE_RATE',
  'VOLCENGINE_SEARCH_API_KEY',
  'VOLCENGINE_SEARCH_CUSTOM_ENDPOINT',
  'VOLCENGINE_SEARCH_TIMEOUT_MS',
] as const;

const credentialEnvironmentKey: Record<ServiceCredentialKey, string> = {
  deepseekApiKey: 'DEEPSEEK_API_KEY',
  sttAppId: 'VOLCENGINE_SPEECH_APP_ID',
  sttAccessToken: 'VOLCENGINE_SPEECH_ACCESS_TOKEN',
  ttsAppId: 'VOLCENGINE_SPEECH_APP_ID',
  ttsAccessToken: 'VOLCENGINE_SPEECH_ACCESS_TOKEN',
  searchApiKey: 'VOLCENGINE_SEARCH_API_KEY',
};

export function serviceSettingsFromConfig(config: AppConfig): DesktopServiceSettings {
  return {
    llm: { baseUrl: config.llm.baseUrl, model: config.llm.model },
    stt: {
      endpoint: config.volcengine.stt.endpoint,
      resourceId: config.volcengine.stt.resourceId,
      model: config.volcengine.stt.model,
    },
    tts: {
      endpoint: config.volcengine.tts.endpoint,
      resourceId: config.volcengine.tts.resourceId,
      speaker: config.volcengine.tts.speaker,
      sampleRate: config.volcengine.tts.sampleRate,
    },
    search: { endpoint: config.search.endpoint, timeoutMs: config.search.timeoutMs },
  };
}

export function applyDesktopServiceSettings(
  baseEnvironment: NodeJS.ProcessEnv,
  inheritedEnvironment: NodeJS.ProcessEnv,
  settings: DesktopServiceSettings = defaultDesktopServiceSettings,
  credentials: StoredServiceCredentials = {},
): NodeJS.ProcessEnv {
  const next = { ...baseEnvironment };
  const overrides: NodeJS.ProcessEnv = {
    DEEPSEEK_BASE_URL: settings.llm.baseUrl,
    DEEPSEEK_LLM_MODEL: settings.llm.model,
    VOLCENGINE_STT_ENDPOINT: settings.stt.endpoint,
    VOLCENGINE_STT_RESOURCE_ID: settings.stt.resourceId,
    VOLCENGINE_STT_MODEL: settings.stt.model,
    VOLCENGINE_TTS_ENDPOINT: settings.tts.endpoint,
    VOLCENGINE_TTS_RESOURCE_ID: settings.tts.resourceId,
    VOLCENGINE_TTS_SPEAKER: settings.tts.speaker,
    VOLCENGINE_TTS_SAMPLE_RATE: String(settings.tts.sampleRate),
    VOLCENGINE_SEARCH_CUSTOM_ENDPOINT: settings.search.endpoint,
    VOLCENGINE_SEARCH_TIMEOUT_MS: String(settings.search.timeoutMs),
  };
  for (const key of providerEnvironmentKeys) {
    const inherited = inheritedEnvironment[key];
    if (inherited !== undefined) {
      next[key] = inherited;
      continue;
    }
    const override = overrides[key];
    if (override !== undefined) next[key] = override;
  }
  for (const [credentialKey, value] of Object.entries(credentials) as [
    ServiceCredentialKey,
    string | undefined,
  ][]) {
    if (!value) continue;
    const environmentKey = credentialEnvironmentKey[credentialKey];
    if (inheritedEnvironment[environmentKey] === undefined) next[environmentKey] = value;
  }
  return next;
}

export function mergeCredentialUpdates(
  current: StoredServiceCredentials,
  updates: Partial<Record<ServiceCredentialKey, string | null | undefined>>,
): StoredServiceCredentials {
  const next = { ...current };
  for (const [key, value] of Object.entries(updates) as [
    ServiceCredentialKey,
    string | null | undefined,
  ][]) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}
