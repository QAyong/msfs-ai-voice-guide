import type { MenuItemConstructorOptions } from 'electron';
import type { DesktopLocale } from '../../shared/desktop-locale.js';

export type TrayMenuOptions = {
  locale: DesktopLocale;
  connected: boolean;
  onOpenChat(): void;
  onOpenSettings(): void;
  onQuit(): void;
};

export const buildTrayMenuTemplate = (options: TrayMenuOptions): MenuItemConstructorOptions[] => {
  const english = options.locale === 'en-US';

  return [
    {
      label: english ? 'Open chat panel' : '打开聊天面板',
      click: options.onOpenChat,
    },
    {
      label: english ? 'Open settings' : '打开设置',
      click: options.onOpenSettings,
    },
    {
      label: options.connected
        ? english
          ? 'Game: connected'
          : '游戏：已连接'
        : english
          ? 'Game: disconnected'
          : '游戏：未连接',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: english ? 'Quit app' : '退出应用',
      click: options.onQuit,
    },
  ];
};
