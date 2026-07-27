import { z } from 'zod';

export const supportedLocaleSchema = z.enum(['zh-CN', 'en-US']);
export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: '必须使用 https: URL',
  });
const wssUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'wss:', {
    message: '必须使用 wss: URL',
  });
const nonEmptyText = z.string().trim().min(1);

export const desktopServiceSettingsSchema = z
  .object({
    llm: z.object({ baseUrl: httpsUrl, model: nonEmptyText }).strict(),
    stt: z.object({ endpoint: wssUrl, resourceId: nonEmptyText, model: nonEmptyText }).strict(),
    tts: z
      .object({
        endpoint: wssUrl,
        resourceId: nonEmptyText,
        speaker: nonEmptyText,
        sampleRate: z.number().int().min(8_000).max(48_000),
      })
      .strict(),
    search: z
      .object({ endpoint: httpsUrl, timeoutMs: z.number().int().min(1_000).max(60_000) })
      .strict(),
  })
  .strict();
export type DesktopServiceSettings = z.infer<typeof desktopServiceSettingsSchema>;

export const serviceCredentialKeys = [
  'deepseekApiKey',
  'sttAppId',
  'sttAccessToken',
  'ttsAppId',
  'ttsAccessToken',
  'searchApiKey',
] as const;
export type ServiceCredentialKey = (typeof serviceCredentialKeys)[number];

const credentialValue = z.string().trim().min(1);
export const serviceCredentialUpdatesSchema = z
  .object({
    deepseekApiKey: credentialValue.nullable().optional(),
    sttAppId: credentialValue.nullable().optional(),
    sttAccessToken: credentialValue.nullable().optional(),
    ttsAppId: credentialValue.nullable().optional(),
    ttsAccessToken: credentialValue.nullable().optional(),
    searchApiKey: credentialValue.nullable().optional(),
  })
  .strict();
export type ServiceCredentialUpdates = z.infer<typeof serviceCredentialUpdatesSchema>;
export type StoredServiceCredentials = Partial<Record<ServiceCredentialKey, string>>;

export const serviceSettingsSaveRequestSchema = z
  .object({
    services: desktopServiceSettingsSchema,
    credentials: serviceCredentialUpdatesSchema,
  })
  .strict();
export type ServiceSettingsSaveRequest = z.infer<typeof serviceSettingsSaveRequestSchema>;

export const serviceCheckTargetSchema = z.enum(['llm', 'stt', 'tts', 'search']);
export type ServiceCheckTarget = z.infer<typeof serviceCheckTargetSchema>;

export const serviceCheckRequestSchema = z
  .object({
    target: serviceCheckTargetSchema,
    services: desktopServiceSettingsSchema,
    credentials: serviceCredentialUpdatesSchema,
  })
  .strict();
export type ServiceCheckRequest = z.infer<typeof serviceCheckRequestSchema>;

export type ServiceCheckResult = {
  target: ServiceCheckTarget;
  status: 'available' | 'unavailable' | 'rate_limited';
  message: string;
  latencyMs?: number;
};

export type ServiceCredentialStatus = {
  encryptionAvailable: boolean;
  configured: Record<ServiceCredentialKey, boolean>;
  error?: string;
};

export const defaultDesktopServiceSettings: DesktopServiceSettings = {
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
  search: { endpoint: 'https://open.feedcoopapi.com/search_api/web_search', timeoutMs: 10_000 },
};
