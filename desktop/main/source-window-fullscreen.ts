import type { Rectangle } from 'electron';
import { clamp } from './window-placement.js';
import { SOURCE_TITLE_BAR_HEIGHT } from './source-view-bounds.js';

export const SOURCE_VIDEO_ASPECT_RATIO = 16 / 9;
export const SOURCE_VIDEO_DEFAULT_WIDTH = 800;

export const getLandscapeSourceWindowBounds = (
  currentBounds: Rectangle,
  workArea: Rectangle,
  preferredWidth = SOURCE_VIDEO_DEFAULT_WIDTH,
  margin = 16,
): Rectangle => {
  const availableWidth = Math.max(280, workArea.width - margin * 2);
  const availableContentHeight = Math.max(
    160,
    workArea.height - margin * 2 - SOURCE_TITLE_BAR_HEIGHT,
  );
  const widthLimit = Math.max(
    280,
    Math.min(availableWidth, Math.round(availableContentHeight * SOURCE_VIDEO_ASPECT_RATIO)),
  );
  const width = Math.min(Math.max(280, preferredWidth), widthLimit);
  const height = Math.round(width / SOURCE_VIDEO_ASPECT_RATIO) + SOURCE_TITLE_BAR_HEIGHT;
  const x = clamp(
    Math.round(currentBounds.x + (currentBounds.width - width) / 2),
    workArea.x + margin,
    workArea.x + workArea.width - width - margin,
  );
  const y = clamp(
    Math.round(currentBounds.y + (currentBounds.height - height) / 2),
    workArea.y + margin,
    workArea.y + workArea.height - height - margin,
  );

  return { x, y, width, height };
};
