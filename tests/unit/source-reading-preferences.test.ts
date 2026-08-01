import { describe, expect, it } from 'vitest';
import {
  defaultSourceReadingPreference,
  normalizeSourceReadingPreferences,
  sourceReadingOrigin,
  sourceReadingPreferenceForUrl,
  updateSourceReadingPreference,
} from '../../shared/source-reading-preferences.js';

describe('source reading preferences', () => {
  it('keys preferences by origin without retaining paths or query strings', () => {
    const preferences = updateSourceReadingPreference(
      {},
      'https://example.com/article?id=42#section',
      { mode: 'desktop', zoomPercent: 110 },
    );
    expect(preferences).toEqual({
      'https://example.com': { mode: 'desktop', zoomPercent: 110, modeSelected: true },
    });
    expect(sourceReadingOrigin('https://example.com/article?id=42')).toBe('https://example.com');
  });

  it('keeps different origins isolated and defaults new sites to mobile at 100 percent', () => {
    const preferences = updateSourceReadingPreference({}, 'https://example.com/article', {
      mode: 'desktop',
      zoomPercent: 130,
    });
    const updatedMode = updateSourceReadingPreference(preferences, 'https://example.com/other', {
      mode: 'mobile',
    });
    expect(sourceReadingPreferenceForUrl(updatedMode, 'https://example.com/other')).toEqual({
      mode: 'mobile',
      zoomPercent: 130,
      modeSelected: true,
    });
    expect(sourceReadingPreferenceForUrl(updatedMode, 'https://other.example/article')).toEqual(
      defaultSourceReadingPreference,
    );
  });

  it('migrates legacy Bilibili mobile defaults while retaining explicit choices', () => {
    expect(
      sourceReadingPreferenceForUrl({}, 'https://www.bilibili.com/video/BV1xx411c7mD'),
    ).toEqual({ mode: 'desktop', zoomPercent: 100 });
    expect(
      sourceReadingPreferenceForUrl(
        { 'https://www.bilibili.com': { mode: 'mobile', zoomPercent: 120 } },
        'https://www.bilibili.com/video/BV1xx411c7mD',
      ),
    ).toEqual({ mode: 'desktop', zoomPercent: 120 });
    expect(
      sourceReadingPreferenceForUrl(
        { 'https://www.bilibili.com': { mode: 'mobile', zoomPercent: 120, modeSelected: true } },
        'https://www.bilibili.com/video/BV1xx411c7mD',
      ),
    ).toEqual({ mode: 'mobile', zoomPercent: 120, modeSelected: true });
  });

  it('drops malformed, unsafe, and non-stepped persisted preferences', () => {
    expect(
      normalizeSourceReadingPreferences({
        'https://example.com': { mode: 'mobile', zoomPercent: 100 },
        'https://broken.example': { mode: 'tablet', zoomPercent: 100 },
        'https://off-grid.example': { mode: 'desktop', zoomPercent: 105 },
        'file:///private/path': { mode: 'desktop', zoomPercent: 100 },
      }),
    ).toEqual({ 'https://example.com': { mode: 'mobile', zoomPercent: 100 } });
  });
});
