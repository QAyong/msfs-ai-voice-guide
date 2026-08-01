import type { ExploreVideoPlatform } from './explore-contracts.js';

export const defaultExploreVideoPlatforms = (locale: 'zh-CN' | 'en-US'): ExploreVideoPlatform[] =>
  locale === 'en-US' ? ['youtube'] : ['bilibili'];
