import { describe, expect, it, vi } from 'vitest';
import { isLiveWindow, releaseWindowReference } from '../../desktop/main/window-lifecycle.js';

describe('window lifecycle', () => {
  it('accepts only windows whose native object is still alive', () => {
    expect(isLiveWindow(null)).toBe(false);
    expect(isLiveWindow({ isDestroyed: () => false })).toBe(true);
    expect(isLiveWindow({ isDestroyed: () => true })).toBe(false);
  });

  it('treats a failing native lifecycle query as a destroyed window', () => {
    const isDestroyed = vi.fn(() => {
      throw new TypeError('Object has been destroyed');
    });

    expect(isLiveWindow({ isDestroyed })).toBe(false);
    expect(isDestroyed).toHaveBeenCalledOnce();
  });

  it('does not let an old closing window clear a newer replacement', () => {
    const oldWindow = { id: 'old' };
    const newWindow = { id: 'new' };

    expect(releaseWindowReference(oldWindow, oldWindow)).toBeNull();
    expect(releaseWindowReference(newWindow, oldWindow)).toBe(newWindow);
  });
});
