import { describe, expect, it } from 'vitest';
import { getSourceViewBounds } from '../../desktop/main/source-view-bounds.js';

describe('source view bounds', () => {
  it('uses the actual source-window content width below the local title bar', () => {
    expect(getSourceViewBounds([440, 600])).toEqual({ x: 0, y: 48, width: 440, height: 552 });
  });

  it('updates directly for a resized source window without a virtual layout width', () => {
    expect(getSourceViewBounds([912, 480])).toEqual({ x: 0, y: 48, width: 912, height: 432 });
  });

  it('does not produce negative dimensions for a very small content area', () => {
    expect(getSourceViewBounds([0, 20])).toEqual({ x: 0, y: 48, width: 0, height: 0 });
  });
});
