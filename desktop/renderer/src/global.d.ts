export {};

declare global {
  interface Window {
    desktop?: {
      setCollapsed(collapsed: boolean): Promise<void>;
      setBallMenuOpen(open: boolean): Promise<'up' | 'down'>;
      openSettings(): Promise<void>;
      openQuitDialog(): Promise<void>;
      closeUtilityWindow(): Promise<void>;
      quitApp(): Promise<void>;
      setAlwaysOnTop(enabled: boolean): Promise<void>;
      openSource(url: string): Promise<boolean>;
      closeSource(): Promise<void>;
      openExternal(url: string): Promise<void>;
    };
  }
}
