import { z } from 'zod';
import { searchProviderSchema, type SearchProviderName } from '../../shared/search-provider.js';
import { defaultSearchEndpointByProvider, defaultSearchTimeoutMs } from '../search/defaults.js';

const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const requiredText = z.string().trim().min(1);
const defaultLiveKitAgentName = 'msfs-voice-guide';
const webSocketUrl = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'ws:' || protocol === 'wss:';
  }, '必须是 ws:// 或 wss:// URL');
const positiveInteger = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : Number(value)),
    z.number().int().positive().default(defaultValue),
  );
const boundedInteger = (defaultValue: number, minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : Number(value)),
    z.number().int().min(minimum).max(maximum).default(defaultValue),
  );

const searchProviderEnvironmentSchema = searchProviderSchema.default('volcengine');

const searchEnvironmentSchema = z.object({
  SEARCH_PROVIDER: searchProviderEnvironmentSchema,
  VOLCENGINE_SEARCH_API_KEY: optionalNonEmpty,
  VOLCENGINE_SEARCH_CUSTOM_ENDPOINT: z
    .string()
    .url()
    .default(defaultSearchEndpointByProvider.volcengine),
  VOLCENGINE_SEARCH_TIMEOUT_MS: positiveInteger(defaultSearchTimeoutMs),
  BOCHA_SEARCH_API_KEY: optionalNonEmpty,
  BOCHA_SEARCH_ENDPOINT: z.string().url().default(defaultSearchEndpointByProvider.bocha),
  BOCHA_SEARCH_TIMEOUT_MS: positiveInteger(defaultSearchTimeoutMs),
});

const llmEnvironmentSchema = z.object({
  DEEPSEEK_API_KEY: requiredText,
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_LLM_MODEL: requiredText.default('deepseek-v4-flash'),
});

const msfsEnvironmentSchema = z.object({
  MSFS_CLI_PATH: optionalNonEmpty,
  MSFS_CLI_TIMEOUT_MS: boundedInteger(15_000, 500, 60_000),
  MSFS_CLI_MAX_CONCURRENCY: boundedInteger(2, 1, 4),
  MSFS_TRACK_INTERVAL_MS: boundedInteger(3_000, 1_000, 60_000),
  MSFS_TRACK_MAX_POINTS: boundedInteger(120, 10, 120),
});

const envSchema = z.object({
  LIVEKIT_URL: webSocketUrl,
  LIVEKIT_API_KEY: requiredText,
  LIVEKIT_API_SECRET: requiredText,
  LIVEKIT_AGENT_NAME: requiredText.default(defaultLiveKitAgentName),
  DEEPSEEK_API_KEY: requiredText,
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_LLM_MODEL: requiredText.default('deepseek-v4-flash'),
  SEARCH_PROVIDER: searchProviderEnvironmentSchema,
  VOLCENGINE_SPEECH_API_KEY: optionalNonEmpty,
  VOLCENGINE_SPEECH_APP_ID: requiredText,
  VOLCENGINE_SPEECH_ACCESS_TOKEN: requiredText,
  VOLCENGINE_STT_ENDPOINT: webSocketUrl,
  VOLCENGINE_STT_RESOURCE_ID: requiredText,
  VOLCENGINE_STT_MODEL: optionalNonEmpty,
  VOLCENGINE_STT_LANGUAGE: optionalNonEmpty,
  VOLCENGINE_TTS_ENDPOINT: webSocketUrl,
  VOLCENGINE_TTS_RESOURCE_ID: requiredText,
  VOLCENGINE_TTS_SPEAKER: requiredText,
  VOLCENGINE_TTS_SAMPLE_RATE: positiveInteger(24_000),
  VOLCENGINE_SEARCH_API_KEY: optionalNonEmpty,
  VOLCENGINE_SEARCH_CUSTOM_ENDPOINT: z
    .string()
    .url()
    .default(defaultSearchEndpointByProvider.volcengine),
  VOLCENGINE_SEARCH_TIMEOUT_MS: positiveInteger(defaultSearchTimeoutMs),
  BOCHA_SEARCH_API_KEY: optionalNonEmpty,
  BOCHA_SEARCH_ENDPOINT: z.string().url().default(defaultSearchEndpointByProvider.bocha),
  BOCHA_SEARCH_TIMEOUT_MS: positiveInteger(defaultSearchTimeoutMs),
  MSFS_CLI_PATH: optionalNonEmpty,
  MSFS_CLI_TIMEOUT_MS: boundedInteger(15_000, 500, 60_000),
  MSFS_CLI_MAX_CONCURRENCY: boundedInteger(2, 1, 4),
  MSFS_TRACK_INTERVAL_MS: boundedInteger(3_000, 1_000, 60_000),
  MSFS_TRACK_MAX_POINTS: boundedInteger(120, 10, 120),
});

export type AppConfig = {
  livekit: {
    url: string;
    apiKey: string;
    apiSecret: string;
    agentName: string;
  };
  llm: {
    provider: 'deepseek';
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  volcengine: {
    stt: {
      apiKey?: string;
      appId: string;
      accessToken: string;
      endpoint: string;
      resourceId: string;
      model: string;
      language: string;
      sampleRate: number;
    };
    tts: {
      appId: string;
      accessToken: string;
      endpoint: string;
      resourceId: string;
      speaker: string;
      sampleRate: number;
    };
  };
  search: {
    provider: SearchProviderName;
    apiKey?: string;
    endpoint: string;
    timeoutMs: number;
  };
  msfs: {
    cliPath?: string;
    timeoutMs: number;
    maxConcurrency: number;
    trackIntervalMs: number;
    trackMaximumPoints: number;
  };
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type SearchConfig = {
  provider: SearchProviderName;
  apiKey: string;
  endpoint: string;
  timeoutMs: number;
};

export type LlmConfig = AppConfig['llm'];
export type MsfsConfig = AppConfig['msfs'];

export function formatConfigError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '环境配置'}：${issue.message}`)
    .join('\n');
}

type SearchEnvironment = z.infer<typeof searchEnvironmentSchema>;

function selectSearchSettings(value: SearchEnvironment): {
  provider: SearchProviderName;
  apiKey?: string;
  endpoint: string;
  timeoutMs: number;
} {
  if (value.SEARCH_PROVIDER === 'bocha') {
    return {
      provider: 'bocha',
      ...(value.BOCHA_SEARCH_API_KEY ? { apiKey: value.BOCHA_SEARCH_API_KEY } : {}),
      endpoint: value.BOCHA_SEARCH_ENDPOINT,
      timeoutMs: value.BOCHA_SEARCH_TIMEOUT_MS,
    };
  }

  return {
    provider: 'volcengine',
    ...(value.VOLCENGINE_SEARCH_API_KEY ? { apiKey: value.VOLCENGINE_SEARCH_API_KEY } : {}),
    endpoint: value.VOLCENGINE_SEARCH_CUSTOM_ENDPOINT,
    timeoutMs: value.VOLCENGINE_SEARCH_TIMEOUT_MS,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`环境配置无效：\n${formatConfigError(result.error)}`);
  }

  const value = result.data;
  const search = selectSearchSettings(value);
  return {
    livekit: {
      url: value.LIVEKIT_URL,
      apiKey: value.LIVEKIT_API_KEY,
      apiSecret: value.LIVEKIT_API_SECRET,
      agentName: value.LIVEKIT_AGENT_NAME,
    },
    llm: {
      provider: 'deepseek',
      apiKey: value.DEEPSEEK_API_KEY,
      baseUrl: value.DEEPSEEK_BASE_URL,
      model: value.DEEPSEEK_LLM_MODEL,
    },
    volcengine: {
      stt: {
        ...(value.VOLCENGINE_SPEECH_API_KEY ? { apiKey: value.VOLCENGINE_SPEECH_API_KEY } : {}),
        appId: value.VOLCENGINE_SPEECH_APP_ID,
        accessToken: value.VOLCENGINE_SPEECH_ACCESS_TOKEN,
        endpoint: value.VOLCENGINE_STT_ENDPOINT,
        resourceId: value.VOLCENGINE_STT_RESOURCE_ID,
        model: value.VOLCENGINE_STT_MODEL ?? 'bigmodel',
        language: value.VOLCENGINE_STT_LANGUAGE ?? 'zh',
        sampleRate: 16_000,
      },
      tts: {
        appId: value.VOLCENGINE_SPEECH_APP_ID,
        accessToken: value.VOLCENGINE_SPEECH_ACCESS_TOKEN,
        endpoint: value.VOLCENGINE_TTS_ENDPOINT,
        resourceId: value.VOLCENGINE_TTS_RESOURCE_ID,
        speaker: value.VOLCENGINE_TTS_SPEAKER,
        sampleRate: value.VOLCENGINE_TTS_SAMPLE_RATE,
      },
    },
    search,
    msfs: {
      ...(value.MSFS_CLI_PATH ? { cliPath: value.MSFS_CLI_PATH } : {}),
      timeoutMs: value.MSFS_CLI_TIMEOUT_MS,
      maxConcurrency: value.MSFS_CLI_MAX_CONCURRENCY,
      trackIntervalMs: value.MSFS_TRACK_INTERVAL_MS,
      trackMaximumPoints: value.MSFS_TRACK_MAX_POINTS,
    },
  };
}

export function loadSearchConfig(env: NodeJS.ProcessEnv = process.env): SearchConfig {
  const result = searchEnvironmentSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`环境配置无效：\n${formatConfigError(result.error)}`);
  }

  const search = selectSearchSettings(result.data);
  if (!search.apiKey) {
    const keyName =
      search.provider === 'bocha' ? 'BOCHA_SEARCH_API_KEY' : 'VOLCENGINE_SEARCH_API_KEY';
    throw new ConfigError(`环境配置无效：\n${keyName}：Required`);
  }
  return { ...search, apiKey: search.apiKey };
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const result = llmEnvironmentSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`环境配置无效：\n${formatConfigError(result.error)}`);
  }
  return {
    provider: 'deepseek',
    apiKey: result.data.DEEPSEEK_API_KEY,
    baseUrl: result.data.DEEPSEEK_BASE_URL,
    model: result.data.DEEPSEEK_LLM_MODEL,
  };
}

export function loadMsfsConfig(env: NodeJS.ProcessEnv = process.env): MsfsConfig {
  const result = msfsEnvironmentSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`环境配置无效：\n${formatConfigError(result.error)}`);
  }
  return {
    ...(result.data.MSFS_CLI_PATH ? { cliPath: result.data.MSFS_CLI_PATH } : {}),
    timeoutMs: result.data.MSFS_CLI_TIMEOUT_MS,
    maxConcurrency: result.data.MSFS_CLI_MAX_CONCURRENCY,
    trackIntervalMs: result.data.MSFS_TRACK_INTERVAL_MS,
    trackMaximumPoints: result.data.MSFS_TRACK_MAX_POINTS,
  };
}
