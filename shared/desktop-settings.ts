import { z } from 'zod';
import { searchProviderSchema, type SearchProviderName } from './search-provider.js';

export const supportedLocaleSchema = z.enum(['zh-CN', 'en-US']);
export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;

export type DesktopTtsVoiceSample = {
  name: string;
  speaker: string;
  locale: SupportedLocale;
  fileName: string;
  dataUrl: string;
};

export const defaultTtsSpeakerByLocale: Record<SupportedLocale, string> = {
  'zh-CN': 'zh_female_vv_uranus_bigtts',
  'en-US': 'en_female_dacey_uranus_bigtts',
};

const confirmedTtsSpeakerLocales: Record<string, SupportedLocale> = {
  zh_female_vv_uranus_bigtts: 'zh-CN',
  zh_female_xiaohe_uranus_bigtts: 'zh-CN',
  zh_female_cancan_uranus_bigtts: 'zh-CN',
  zh_female_linjianvhai_uranus_bigtts: 'zh-CN',
  en_female_dacey_uranus_bigtts: 'en-US',
  en_female_stokie_uranus_bigtts: 'en-US',
};

const retiredTtsSpeakerFallbacks: Record<string, Record<SupportedLocale, string>> = {
  en_male_tim_uranus_bigtts: defaultTtsSpeakerByLocale,
};

export const alignTtsSpeakerToLocale = (speaker: string, locale: SupportedLocale): string => {
  const normalizedSpeaker = speaker.trim();
  const retiredFallback = retiredTtsSpeakerFallbacks[normalizedSpeaker];
  if (retiredFallback) return retiredFallback[locale];

  const currentLocale = confirmedTtsSpeakerLocales[normalizedSpeaker];
  return currentLocale && currentLocale !== locale ? defaultTtsSpeakerByLocale[locale] : speaker;
};

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
    search: z.object({ provider: searchProviderSchema }).strict(),
  })
  .strict();
export type DesktopServiceSettings = z.infer<typeof desktopServiceSettingsSchema>;

export const defaultDesktopToolSettings = {
  getFlightSnapshot: true,
  getLocationContext: true,
  getRouteBrief: true,
  getNextWaypoint: true,
  getNearbyFacilities: true,
  getWeatherAndSimTime: true,
  getTrackHistory: true,
  setAutopilot: true,
  searchWeb: true,
} as const;

export const desktopToolSettingsSchema = z
  .object({
    getFlightSnapshot: z.boolean(),
    getLocationContext: z.boolean(),
    getRouteBrief: z.boolean(),
    getNextWaypoint: z.boolean(),
    getNearbyFacilities: z.boolean(),
    getWeatherAndSimTime: z.boolean(),
    getTrackHistory: z.boolean(),
    setAutopilot: z.boolean(),
    searchWeb: z.boolean(),
  })
  .strict();
export type DesktopToolSettings = z.infer<typeof desktopToolSettingsSchema>;

export const desktopToolSettingsEnvironmentKey = 'GUIDE_ENABLED_TOOLS';

export function parseDesktopToolSettingsEnvironment(value?: string): DesktopToolSettings {
  if (!value) return { ...defaultDesktopToolSettings };
  try {
    const parsed = desktopToolSettingsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : { ...defaultDesktopToolSettings };
  } catch {
    return { ...defaultDesktopToolSettings };
  }
}

export const serviceCredentialKeys = [
  'deepseekApiKey',
  'sttAppId',
  'sttAccessToken',
  'ttsAppId',
  'ttsAccessToken',
  'searchApiKey',
  'bochaSearchApiKey',
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
    bochaSearchApiKey: credentialValue.nullable().optional(),
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

export const desktopSettingsSaveRequestSchema = z
  .object({
    locale: supportedLocaleSchema,
    services: desktopServiceSettingsSchema,
    credentials: serviceCredentialUpdatesSchema,
    tools: desktopToolSettingsSchema.default(defaultDesktopToolSettings),
  })
  .strict();
export type DesktopSettingsSaveRequest = z.infer<typeof desktopSettingsSaveRequestSchema>;

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
  search: { provider: 'volcengine' satisfies SearchProviderName },
};
