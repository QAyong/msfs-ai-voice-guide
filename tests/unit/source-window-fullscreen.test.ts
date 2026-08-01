import { describe, expect, it } from 'vitest';
import {
  getLandscapeSourceWindowBounds,
  SOURCE_VIDEO_ASPECT_RATIO,
} from '../../desktop/main/source-window-fullscreen.js';
import { SOURCE_TITLE_BAR_HEIGHT } from '../../desktop/main/source-view-bounds.js';

describe('source video fullscreen bounds', () => {
  it('keeps the video area landscape without targeting display fullscreen', () => {
    const bounds = getLandscapeSourceWindowBounds(
      { x: 420, y: 180, width: 440, height: 600 },
      { x: 0, y: 0, width: 1920, height: 1080 },
    );

    expect(bounds.width).toBe(800);
    expect(bounds.height - SOURCE_TITLE_BAR_HEIGHT).toBe(bounds.width / SOURCE_VIDEO_ASPECT_RATIO);
    expect(bounds.width).toBeLessThan(1920);
    expect(bounds.height).toBeLessThan(1080);
  });

  it('clamps the landscape window to the matching work area', () => {
    const bounds = getLandscapeSourceWindowBounds(
      { x: 900, y: 500, width: 440, height: 600 },
      { x: 100, y: 80, width: 640, height: 480 },
    );

    expect(bounds.x).toBeGreaterThanOrEqual(116);
    expect(bounds.y).toBeGreaterThanOrEqual(96);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(724);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(544);
  });
});
