import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenuTemplate } from '../../desktop/main/tray-menu.js';

describe('system tray menu', () => {
  it('keeps the Chinese menu to the four requested actions', () => {
    const menu = buildTrayMenuTemplate({
      locale: 'zh-CN',
      connected: true,
      onOpenChat: vi.fn(),
      onOpenSettings: vi.fn(),
      onQuit: vi.fn(),
    });

    expect(menu).toHaveLength(5);
    expect(menu.filter((item) => item.type !== 'separator').map((item) => item.label)).toEqual([
      '打开聊天面板',
      '打开设置',
      '游戏：已连接',
      '退出应用',
    ]);
    expect(menu[2]).toMatchObject({ enabled: false });
  });

  it('localizes the disconnected status and invokes the menu actions', () => {
    const onOpenChat = vi.fn();
    const onOpenSettings = vi.fn();
    const onQuit = vi.fn();
    const menu = buildTrayMenuTemplate({
      locale: 'en-US',
      connected: false,
      onOpenChat,
      onOpenSettings,
      onQuit,
    });

    expect(menu[2]?.label).toBe('Game: disconnected');
    (menu[0]?.click as (() => void) | undefined)?.();
    (menu[1]?.click as (() => void) | undefined)?.();
    (menu[4]?.click as (() => void) | undefined)?.();
    expect(onOpenChat).toHaveBeenCalledOnce();
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onQuit).toHaveBeenCalledOnce();
  });
});
