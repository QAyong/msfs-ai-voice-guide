import { describe, expect, it } from 'vitest';
import {
  dockToNearestSide,
  getExpandedBounds,
  getRestorableSize,
  keepTitleBarVisible,
  placeCompanionWindow,
} from '../../desktop/main/window-placement.js';

describe('desktop multi-display window placement', () => {
  const leftDisplay = { x: -1920, y: 0, width: 1920, height: 1040 };

  it('preserves negative coordinates when docking on a left-hand display', () => {
    expect(dockToNearestSide({ x: -1800, y: 980, width: 64, height: 72 }, leftDisplay)).toEqual({
      side: 'left',
      x: -1912,
      y: 960,
    });
  });

  it('expands inward from the docked edge of the same display', () => {
    expect(getExpandedBounds(leftDisplay, 'right', 900, { width: 320, height: 360 })).toEqual({
      x: -328,
      y: 672,
      width: 320,
      height: 360,
    });
  });

  it('uses the docked ball position instead of stale coordinates from the last expanded panel', () => {
    const staleExpandedBounds = { x: 752, y: 142, width: 320, height: 360 };

    expect(getExpandedBounds(leftDisplay, 'left', 540, staleExpandedBounds)).toEqual({
      x: -1912,
      y: 540,
      width: 320,
      height: 360,
    });
  });

  it('keeps an expanded panel title bar reachable without blocking cross-display dragging', () => {
    expect(
      keepTitleBarVisible({ x: -2300, y: -100, width: 320, height: 360 }, leftDisplay),
    ).toEqual({ x: -2176, y: 0, width: 320, height: 360 });
  });

  it('restores a valid user-resized panel size', () => {
    expect(
      getRestorableSize({ width: 520, height: 640 }, { width: 320, height: 360 }, leftDisplay),
    ).toEqual({ width: 520, height: 640 });
  });

  it('falls back to the design size when persisted bounds exceed the display work area', () => {
    expect(
      getRestorableSize({ width: 527, height: 1548 }, { width: 320, height: 360 }, leftDisplay),
    ).toEqual({ width: 320, height: 360 });
  });

  it('places a companion window inside a negative-coordinate display', () => {
    expect(
      placeCompanionWindow(
        { x: -328, y: 120, width: 320, height: 360 },
        { width: 440, height: 600 },
        leftDisplay,
      ),
    ).toEqual({ x: -780, y: 120, width: 440, height: 600 });
  });

  it('does not let stale coordinates in full companion bounds override the new placement', () => {
    const fullCompanionBounds = { x: 740, y: 216, width: 440, height: 600 };

    expect(
      placeCompanionWindow({ x: 2437, y: 157, width: 602, height: 832 }, fullCompanionBounds, {
        x: 1920,
        y: -35,
        width: 1536,
        height: 961,
      }),
    ).toEqual({ x: 1985, y: 157, width: 440, height: 600 });
  });
});
