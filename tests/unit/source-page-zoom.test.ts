import { describe, expect, it } from 'vitest';
import {
  canZoomSourcePageIn,
  canZoomSourcePageOut,
  clampSourcePageZoomPercent,
  resetSourcePageZoomPercent,
  sourcePageZoomFactorFromPercent,
  stepSourcePageZoomPercent,
  SOURCE_PAGE_ZOOM_DEFAULT_PERCENT,
  SOURCE_PAGE_ZOOM_MAX_PERCENT,
  SOURCE_PAGE_ZOOM_MIN_PERCENT,
} from '../../shared/source-page-zoom.js';

describe('source page zoom', () => {
  it('defaults to 100 percent and maps to a unit zoom factor', () => {
    expect(resetSourcePageZoomPercent()).toBe(SOURCE_PAGE_ZOOM_DEFAULT_PERCENT);
    expect(sourcePageZoomFactorFromPercent(100)).toBe(1);
    expect(sourcePageZoomFactorFromPercent(50)).toBe(0.5);
    expect(sourcePageZoomFactorFromPercent(200)).toBe(2);
  });

  it('steps by 10 percent within the 50 to 200 range', () => {
    expect(stepSourcePageZoomPercent(100, 'in')).toBe(110);
    expect(stepSourcePageZoomPercent(100, 'out')).toBe(90);
    expect(stepSourcePageZoomPercent(195, 'in')).toBe(SOURCE_PAGE_ZOOM_MAX_PERCENT);
    expect(stepSourcePageZoomPercent(55, 'out')).toBe(SOURCE_PAGE_ZOOM_MIN_PERCENT);
  });

  it('clamps and snaps invalid values to the allowed step grid', () => {
    expect(clampSourcePageZoomPercent(43)).toBe(SOURCE_PAGE_ZOOM_MIN_PERCENT);
    expect(clampSourcePageZoomPercent(211)).toBe(SOURCE_PAGE_ZOOM_MAX_PERCENT);
    expect(clampSourcePageZoomPercent(117)).toBe(120);
    expect(clampSourcePageZoomPercent(Number.NaN)).toBe(SOURCE_PAGE_ZOOM_DEFAULT_PERCENT);
  });

  it('disables further zooming at the range edges', () => {
    expect(canZoomSourcePageOut(SOURCE_PAGE_ZOOM_MIN_PERCENT)).toBe(false);
    expect(canZoomSourcePageIn(SOURCE_PAGE_ZOOM_MIN_PERCENT)).toBe(true);
    expect(canZoomSourcePageIn(SOURCE_PAGE_ZOOM_MAX_PERCENT)).toBe(false);
    expect(canZoomSourcePageOut(SOURCE_PAGE_ZOOM_MAX_PERCENT)).toBe(true);
  });
});
