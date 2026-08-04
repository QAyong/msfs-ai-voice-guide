import {
  SOURCE_PAGE_ZOOM_DEFAULT_PERCENT,
  SOURCE_PAGE_ZOOM_MAX_PERCENT,
  SOURCE_PAGE_ZOOM_MIN_PERCENT,
  SOURCE_PAGE_ZOOM_STEP_PERCENT,
} from './source-page-zoom.js';

export type SourceReadingMode = 'mobile' | 'desktop';

export type SourceReadingPreference = {
  mode: SourceReadingMode;
  zoomPercent: number;
  modeSelected?: true;
};

export type SourceReadingPreferences = Record<string, SourceReadingPreference>;

export const defaultSourceReadingPreference: SourceReadingPreference = {
  mode: 'mobile',
  zoomPercent: SOURCE_PAGE_ZOOM_DEFAULT_PERCENT,
};

const defaultBilibiliReadingPreference: SourceReadingPreference = {
  mode: 'desktop',
  zoomPercent: SOURCE_PAGE_ZOOM_DEFAULT_PERCENT,
};

const isBilibiliHostname = (hostname: string) =>
  hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com');

export function sourceReadingOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}

export function isSourceReadingMode(value: unknown): value is SourceReadingMode {
  return value === 'mobile' || value === 'desktop';
}

export function isSourceReadingZoomPercent(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SOURCE_PAGE_ZOOM_MIN_PERCENT &&
    value <= SOURCE_PAGE_ZOOM_MAX_PERCENT &&
    value % SOURCE_PAGE_ZOOM_STEP_PERCENT === 0
  );
}

export function normalizeSourceReadingPreference(value: unknown): SourceReadingPreference | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (!isSourceReadingMode(candidate.mode) || !isSourceReadingZoomPercent(candidate.zoomPercent)) {
    return null;
  }
  return {
    mode: candidate.mode,
    zoomPercent: candidate.zoomPercent,
    ...(candidate.modeSelected === true ? { modeSelected: true } : {}),
  };
}

export function normalizeSourceReadingPreferences(value: unknown): SourceReadingPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const preferences: SourceReadingPreferences = {};
  for (const [origin, preference] of Object.entries(value)) {
    if (sourceReadingOrigin(origin) !== origin) continue;
    const normalized = normalizeSourceReadingPreference(preference);
    if (normalized) preferences[origin] = normalized;
  }
  return preferences;
}

export function sourceReadingPreferenceForUrl(
  preferences: SourceReadingPreferences | undefined,
  url: string,
): SourceReadingPreference {
  const origin = sourceReadingOrigin(url);
  const preference = origin ? preferences?.[origin] : undefined;
  if (origin && isBilibiliHostname(new URL(origin).hostname)) {
    if (preference?.modeSelected) return { ...preference };
    return {
      ...defaultBilibiliReadingPreference,
      ...(preference ? { zoomPercent: preference.zoomPercent } : {}),
    };
  }
  if (preference) return { ...preference };
  return { ...defaultSourceReadingPreference };
}

export function updateSourceReadingPreference(
  preferences: SourceReadingPreferences,
  url: string,
  update: Partial<SourceReadingPreference>,
): SourceReadingPreferences {
  const origin = sourceReadingOrigin(url);
  if (!origin) return preferences;
  const current = sourceReadingPreferenceForUrl(preferences, url);
  const next = {
    mode: isSourceReadingMode(update.mode) ? update.mode : current.mode,
    zoomPercent: isSourceReadingZoomPercent(update.zoomPercent)
      ? update.zoomPercent
      : current.zoomPercent,
    ...(isSourceReadingMode(update.mode) || current.modeSelected
      ? { modeSelected: true as const }
      : {}),
  };
  return { ...preferences, [origin]: next };
}
