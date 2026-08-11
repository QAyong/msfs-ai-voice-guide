import type { ExplorePreferences, ExploreVideoPlatform } from './explore-contracts.js';

export type ExploreEncyclopedia = 'wikipedia' | 'baidu_baike';
export type ExploreLocale = 'zh-CN' | 'en-US';
export type ExplorePreferencesByLocale = Record<ExploreLocale, ExplorePreferences>;

export const defaultExploreEncyclopedia = (locale: ExploreLocale): ExploreEncyclopedia =>
  locale === 'en-US' ? 'wikipedia' : 'baidu_baike';

export const defaultExploreVideoPlatforms = (locale: ExploreLocale): ExploreVideoPlatform[] =>
  locale === 'en-US' ? ['youtube'] : ['bilibili'];

export const defaultExplorePreferences = (locale: ExploreLocale): ExplorePreferences => ({
  encyclopedia: defaultExploreEncyclopedia(locale),
  videoPlatforms: defaultExploreVideoPlatforms(locale),
});

export const defaultExplorePreferencesByLocale = (): ExplorePreferencesByLocale => ({
  'zh-CN': defaultExplorePreferences('zh-CN'),
  'en-US': defaultExplorePreferences('en-US'),
});

const cloneExplorePreferences = (preferences: ExplorePreferences): ExplorePreferences => ({
  encyclopedia: preferences.encyclopedia,
  videoPlatforms: [...preferences.videoPlatforms],
});

const sameExplorePreferences = (left: ExplorePreferences, right: ExplorePreferences) =>
  left.encyclopedia === right.encyclopedia &&
  left.videoPlatforms.length === right.videoPlatforms.length &&
  left.videoPlatforms.every((platform, index) => platform === right.videoPlatforms[index]);

/**
 * Resolves the current per-locale source preferences and migrates the old single-value shape.
 * A legacy value that exactly matches the other locale's defaults is treated as stale config.
 */
export const resolveExplorePreferencesByLocale = (
  legacyLocale: ExploreLocale,
  savedByLocale?: Partial<ExplorePreferencesByLocale>,
  legacyPreferences?: ExplorePreferences,
): ExplorePreferencesByLocale => {
  const resolved = defaultExplorePreferencesByLocale();
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const saved = savedByLocale?.[locale];
    if (saved) resolved[locale] = cloneExplorePreferences(saved);
  }

  if (legacyPreferences && !savedByLocale?.[legacyLocale]) {
    const otherLocale = legacyLocale === 'en-US' ? 'zh-CN' : 'en-US';
    if (!sameExplorePreferences(legacyPreferences, resolved[otherLocale])) {
      resolved[legacyLocale] = cloneExplorePreferences(legacyPreferences);
    }
  }

  return resolved;
};
