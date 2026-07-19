import { describe, expect, it } from 'vitest';
import {
  desktopLayoutWidth,
  getSourceLayoutZoom,
  portraitLayoutWidth,
} from '../../desktop/main/source-layout-mode.js';

describe('source preview layout mode', () => {
  it('fits a 768px portrait layout into the available source frame', () => {
    expect(getSourceLayoutZoom('portrait', 384)).toBe(0.5);
    expect(portraitLayoutWidth).toBe(768);
  });

  it('fits a desktop layout into the same portrait source frame', () => {
    expect(getSourceLayoutZoom('desktop', 640)).toBe(0.5);
    expect(desktopLayoutWidth).toBe(1280);
  });

  it('falls back to normal zoom while the window has no usable width', () => {
    expect(getSourceLayoutZoom('portrait', 0)).toBe(1);
    expect(getSourceLayoutZoom('desktop', Number.NaN)).toBe(1);
  });
});
