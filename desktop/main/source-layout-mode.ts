import type { SourceLayoutMode } from '../../shared/source-preview.js';

export const portraitLayoutWidth = 768;
export const desktopLayoutWidth = 1280;

export function getSourceLayoutZoom(mode: SourceLayoutMode, availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  const layoutWidth = mode === 'portrait' ? portraitLayoutWidth : desktopLayoutWidth;
  return availableWidth / layoutWidth;
}
