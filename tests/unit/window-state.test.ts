import { describe, expect, it } from 'vitest';
import { parseStoredWindowState } from '../../desktop/main/window-state.js';

describe('desktop window state', () => {
  it('keeps valid assistant, source, collapse and dock state', () => {
    expect(
      parseStoredWindowState(
        JSON.stringify({
          assistant: { x: -1920, y: 80, width: 64, height: 72 },
          expandedAssistant: { x: -320, y: 80, width: 320, height: 360 },
          source: { width: 520, height: 640 },
          sourceReadingPreferences: {
            'https://example.com': { mode: 'mobile', zoomPercent: 110 },
          },
          collapsed: true,
          dockSide: 'left',
        }),
      ),
    ).toEqual({
      assistant: { x: -1920, y: 80, width: 64, height: 72 },
      expandedAssistant: { x: -320, y: 80, width: 320, height: 360 },
      source: { width: 520, height: 640 },
      sourceReadingPreferences: {
        'https://example.com': { mode: 'mobile', zoomPercent: 110 },
      },
      collapsed: true,
      dockSide: 'left',
    });
  });

  it('drops invalid reading preferences without losing valid window state', () => {
    expect(
      parseStoredWindowState(
        JSON.stringify({
          source: { width: 520, height: 640 },
          sourceReadingPreferences: {
            'https://example.com': { mode: 'mobile', zoomPercent: 105 },
            'ftp://example.com': { mode: 'desktop', zoomPercent: 100 },
          },
        }),
      ),
    ).toEqual({ source: { width: 520, height: 640 } });
  });

  it('falls back safely when the state file is corrupt', () => {
    expect(parseStoredWindowState('{not-json')).toEqual({});
    expect(
      parseStoredWindowState(JSON.stringify({ assistant: { x: 0, y: 0, width: -1, height: 20 } })),
    ).toEqual({});
  });
});
