import { describe, expect, it, vi } from 'vitest';
import {
  globalPushToTalkConfigurationSchema,
  isGlobalPushToTalkKey,
} from '../../shared/global-push-to-talk.js';
import { GlobalPushToTalkController } from '../../desktop/main/global-push-to-talk.js';

describe('global push-to-talk configuration', () => {
  it('accepts presets and a single supported custom key', () => {
    expect(isGlobalPushToTalkKey('AltLeft')).toBe(true);
    expect(isGlobalPushToTalkKey('MouseX2')).toBe(true);
    expect(isGlobalPushToTalkKey('KeyQ')).toBe(true);
    expect(
      globalPushToTalkConfigurationSchema.safeParse({ key: 'F12', enabled: true }).success,
    ).toBe(true);
  });

  it('rejects unsupported modifiers, system keys and multi-key strings', () => {
    for (const value of [
      'AltRight',
      'ControlLeft',
      'ShiftRight',
      'MetaLeft',
      'Ctrl+F8',
      'MouseLeft',
    ]) {
      expect(isGlobalPushToTalkKey(value)).toBe(false);
    }
  });
});

describe('GlobalPushToTalkController', () => {
  it('emits only one press and release for repeated native events', () => {
    let callback: ((event: { type: 'press' | 'release' | 'cancel' }) => void) | undefined;
    const start = vi.fn((_key: string, nextCallback: typeof callback) => {
      callback = nextCallback;
      return true;
    });
    const stop = vi.fn();
    const events: string[] = [];
    const controller = new GlobalPushToTalkController({
      addonPath: 'test.node',
      onEvent: (event) => events.push(event.type),
      platform: 'win32',
      loadAddon: () => ({ start, stop }),
    });

    expect(controller.configure({ key: 'F8', enabled: true })).toEqual({
      available: true,
      active: true,
    });
    callback?.({ type: 'press' });
    callback?.({ type: 'press' });
    callback?.({ type: 'release' });
    callback?.({ type: 'release' });

    expect(events).toEqual(['press', 'release']);
    controller.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('releases an active turn before disabling the hook', () => {
    let callback: ((event: { type: 'press' | 'release' | 'cancel' }) => void) | undefined;
    const events: string[] = [];
    const controller = new GlobalPushToTalkController({
      addonPath: 'test.node',
      onEvent: (event) => events.push(event.type),
      platform: 'win32',
      loadAddon: () => ({
        start: (_key, nextCallback) => {
          callback = nextCallback;
          return true;
        },
        stop: vi.fn(),
      }),
    });

    controller.configure({ key: 'F8', enabled: true });
    callback?.({ type: 'press' });
    controller.configure({ key: 'F8', enabled: false });

    expect(events).toEqual(['press', 'cancel']);
  });
});
