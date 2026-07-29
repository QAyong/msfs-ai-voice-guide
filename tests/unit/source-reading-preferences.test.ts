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
      'https://example.com': { mode: 'desktop', zoomPercent: 110 },
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
    });
    expect(sourceReadingPreferenceForUrl(updatedMode, 'https://other.example/article')).toEqual(
      defaultSourceReadingPreference,
    );
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
