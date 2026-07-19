export type DestroyableWindow = {
  isDestroyed(): boolean;
};

export function isLiveWindow<T extends DestroyableWindow>(
  window: T | null | undefined,
): window is T {
  if (!window) return false;
  try {
    return !window.isDestroyed();
  } catch {
    return false;
  }
}

export function releaseWindowReference<T>(current: T | null, closing: T): T | null {
  return current === closing ? null : current;
}
