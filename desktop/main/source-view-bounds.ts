import type { Rectangle } from 'electron';

export const SOURCE_TITLE_BAR_HEIGHT = 48;

export function getSourceViewBounds(contentSize: readonly number[]): Rectangle {
  const contentWidth = contentSize[0] ?? 0;
  const contentHeight = contentSize[1] ?? 0;
  return {
    x: 0,
    y: SOURCE_TITLE_BAR_HEIGHT,
    width: Math.max(0, contentWidth),
    height: Math.max(0, contentHeight - SOURCE_TITLE_BAR_HEIGHT),
  };
}
