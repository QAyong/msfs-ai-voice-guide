import { describe, expect, it } from 'vitest';
import {
  defaultExploreEncyclopedia,
  defaultExplorePreferences,
  defaultExploreVideoPlatforms,
  resolveExplorePreferencesByLocale,
} from '../../shared/explore-defaults.js';

describe('explore defaults', () => {
  it('uses Baidu Baike for the Chinese locale', () => {
    expect(defaultExploreEncyclopedia('zh-CN')).toBe('baidu_baike');
  });

  it('uses Wikipedia for the English locale', () => {
    expect(defaultExploreEncyclopedia('en-US')).toBe('wikipedia');
  });

  it('uses domestic platforms for Chinese locale', () => {
    expect(defaultExploreVideoPlatforms('zh-CN')).toEqual(['bilibili']);
  });

  it('uses YouTube for English locale', () => {
    expect(defaultExploreVideoPlatforms('en-US')).toEqual(['youtube']);
  });

  it('keeps saved choices separate for each locale', () => {
    const resolved = resolveExplorePreferencesByLocale('zh-CN', {
      'zh-CN': { encyclopedia: 'wikipedia', videoPlatforms: ['youtube'] },
      'en-US': { encyclopedia: 'baidu_baike', videoPlatforms: ['bilibili'] },
    });

    expect(resolved['zh-CN']).toEqual({ encyclopedia: 'wikipedia', videoPlatforms: ['youtube'] });
    expect(resolved['en-US']).toEqual({
      encyclopedia: 'baidu_baike',
      videoPlatforms: ['bilibili'],
    });
  });

  it('does not migrate the opposite locale defaults into a legacy locale', () => {
    const resolved = resolveExplorePreferencesByLocale('en-US', undefined, {
      encyclopedia: 'baidu_baike',
      videoPlatforms: ['bilibili'],
    });

    expect(resolved['en-US']).toEqual(defaultExplorePreferences('en-US'));
  });

  it('migrates a legacy custom choice only to its original locale', () => {
    const resolved = resolveExplorePreferencesByLocale('zh-CN', undefined, {
      encyclopedia: 'wikipedia',
      videoPlatforms: ['youtube', 'bilibili'],
    });

    expect(resolved['zh-CN']).toEqual({
      encyclopedia: 'wikipedia',
      videoPlatforms: ['youtube', 'bilibili'],
    });
    expect(resolved['en-US']).toEqual(defaultExplorePreferences('en-US'));
  });
});
