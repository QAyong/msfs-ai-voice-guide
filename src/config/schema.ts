import { z } from 'zod';

const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const requiredText = z.string().trim().min(1);
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

const searchEnvironmentSchema = z.object({
  VOLCENGINE_SEARCH_API_KEY: requiredText,
  VOLCENGINE_SEARCH_CUSTOM_ENDPOINT: z
    .string()
    .url()
    .default('https://open.feedcoopapi.com/search_api/web_search'),
  VOLCENGINE_SEARCH_TIMEOUT_MS: positiveInteger(10_000),
});

const envSchema = z.object({
  LIVEKIT_URL: webSocketUrl,
  LIVEKIT_API_KEY: requiredText,
  LIVEKIT_API_SECRET: requiredText,
  LIVEKIT_AGENT_NAME: requiredText,
  DEEPSEEK_API_KEY: requiredText,
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_LLM_MODEL: requiredText.default('deepseek-v4-flash'),
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
    .default('https://open.feedcoopapi.com/search_api/web_search'),
  VOLCENGINE_SEARCH_TIMEOUT_MS: positiveInteger(10_000),
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
    apiKey?: string;
    endpoint: string;
    timeoutMs: number;
  };
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type SearchConfig = {
  apiKey: string;
  endpoint: string;
  timeoutMs: number;
};

export function formatConfigError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '环境配置'}：${issue.message}`)
    .join('\n');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`环境配置无效：\n${formatConfigError(result.error)}`);
  }

  const value = result.data;
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
    search: {
      ...(value.VOLCENGINE_SEARCH_API_KEY ? { apiKey: value.VOLCENGINE_SEARCH_API_KEY } : {}),
      endpoint: value.VOLCENGINE_SEARCH_CUSTOM_ENDPOINT,
      timeoutMs: value.VOLCENGINE_SEARCH_TIMEOUT_MS,
    },
  };
}

export function loadSearchConfig(env: NodeJS.ProcessEnv = process.env): SearchConfig {
  const result = searchEnvironmentSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`环境配置无效：\n${formatConfigError(result.error)}`);
  }

  return {
    apiKey: result.data.VOLCENGINE_SEARCH_API_KEY,
    endpoint: result.data.VOLCENGINE_SEARCH_CUSTOM_ENDPOINT,
    timeoutMs: result.data.VOLCENGINE_SEARCH_TIMEOUT_MS,
  };
}
