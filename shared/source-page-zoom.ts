export const SOURCE_PAGE_ZOOM_MIN_PERCENT = 50;
export const SOURCE_PAGE_ZOOM_MAX_PERCENT = 200;
export const SOURCE_PAGE_ZOOM_DEFAULT_PERCENT = 100;
export const SOURCE_PAGE_ZOOM_STEP_PERCENT = 10;

export type SourcePageZoomDirection = 'in' | 'out';
export type SourcePageZoomAction = SourcePageZoomDirection | 'reset';

export function clampSourcePageZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) return SOURCE_PAGE_ZOOM_DEFAULT_PERCENT;
  const rounded =
    Math.round(percent / SOURCE_PAGE_ZOOM_STEP_PERCENT) * SOURCE_PAGE_ZOOM_STEP_PERCENT;
  return Math.min(SOURCE_PAGE_ZOOM_MAX_PERCENT, Math.max(SOURCE_PAGE_ZOOM_MIN_PERCENT, rounded));
}

export function stepSourcePageZoomPercent(
  percent: number,
  direction: SourcePageZoomDirection,
): number {
  const current = clampSourcePageZoomPercent(percent);
  const delta = direction === 'in' ? SOURCE_PAGE_ZOOM_STEP_PERCENT : -SOURCE_PAGE_ZOOM_STEP_PERCENT;
  return clampSourcePageZoomPercent(current + delta);
}

export function resetSourcePageZoomPercent(): number {
  return SOURCE_PAGE_ZOOM_DEFAULT_PERCENT;
}

export function sourcePageZoomFactorFromPercent(percent: number): number {
  return clampSourcePageZoomPercent(percent) / 100;
}

export function canZoomSourcePageIn(percent: number): boolean {
  return clampSourcePageZoomPercent(percent) < SOURCE_PAGE_ZOOM_MAX_PERCENT;
}

export function canZoomSourcePageOut(percent: number): boolean {
  return clampSourcePageZoomPercent(percent) > SOURCE_PAGE_ZOOM_MIN_PERCENT;
}
