export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockSide = 'left' | 'right';

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(value, maximum));

export const dockToNearestSide = (bounds: WindowBounds, workArea: WindowBounds, margin = 8) => {
  const side: DockSide =
    bounds.x + bounds.width / 2 < workArea.x + workArea.width / 2 ? 'left' : 'right';
  const x =
    side === 'left' ? workArea.x + margin : workArea.x + workArea.width - bounds.width - margin;
  const y = clamp(
    bounds.y,
    workArea.y + margin,
    workArea.y + workArea.height - bounds.height - margin,
  );
  return { side, x, y };
};

export const getExpandedBounds = (
  workArea: WindowBounds,
  side: DockSide,
  y: number,
  size: Pick<WindowBounds, 'width' | 'height'>,
  margin = 8,
): WindowBounds => ({
  ...size,
  x: side === 'left' ? workArea.x + margin : workArea.x + workArea.width - size.width - margin,
  y: clamp(y, workArea.y + margin, workArea.y + workArea.height - size.height - margin),
});

export const getRestorableSize = (
  candidate: Pick<WindowBounds, 'width' | 'height'> | null | undefined,
  fallback: Pick<WindowBounds, 'width' | 'height'>,
  workArea: WindowBounds,
  margin = 16,
) => {
  if (
    !candidate ||
    candidate.width > workArea.width - margin * 2 ||
    candidate.height > workArea.height - margin * 2
  ) {
    return fallback;
  }
  return { width: candidate.width, height: candidate.height };
};

export const keepTitleBarVisible = (
  bounds: WindowBounds,
  workArea: WindowBounds,
  titleBarHeight = 42,
  minimumHorizontalVisibility = 64,
): WindowBounds => ({
  ...bounds,
  x: clamp(
    bounds.x,
    workArea.x - bounds.width + minimumHorizontalVisibility,
    workArea.x + workArea.width - minimumHorizontalVisibility,
  ),
  y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - titleBarHeight),
});

export const placeCompanionWindow = (
  assistantBounds: WindowBounds,
  companionSize: Pick<WindowBounds, 'width' | 'height'>,
  workArea: WindowBounds,
  gap = 12,
  margin = 16,
): WindowBounds => {
  const leftX = assistantBounds.x - companionSize.width - gap;
  const rightX = assistantBounds.x + assistantBounds.width + gap;
  const leftSpace = assistantBounds.x - (workArea.x + margin);
  const rightSpace =
    workArea.x + workArea.width - margin - (assistantBounds.x + assistantBounds.width);
  const preferredX =
    rightSpace >= companionSize.width + gap || rightSpace >= leftSpace ? rightX : leftX;

  return {
    ...companionSize,
    x: clamp(
      preferredX,
      workArea.x + margin,
      workArea.x + workArea.width - companionSize.width - margin,
    ),
    y: clamp(
      assistantBounds.y,
      workArea.y + margin,
      workArea.y + workArea.height - companionSize.height - margin,
    ),
  };
};
