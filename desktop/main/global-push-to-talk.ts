import { createRequire } from 'node:module';
import { join } from 'node:path';
import type {
  GlobalPushToTalkConfiguration,
  GlobalPushToTalkEvent,
  GlobalPushToTalkStatus,
} from '../../shared/global-push-to-talk.js';
import { localizeDesktopText, type DesktopLocale } from '../../shared/desktop-locale.js';

type NativeGlobalPushToTalkAddon = {
  start(key: string, callback: (event: GlobalPushToTalkEvent) => void): boolean;
  stop(): void;
};

export type GlobalPushToTalkControllerOptions = {
  addonPath: string;
  onEvent(event: GlobalPushToTalkEvent): void;
  getLocale?: () => DesktopLocale;
  platform?: NodeJS.Platform;
  loadAddon?(path: string): NativeGlobalPushToTalkAddon;
};

const nativeRequire = createRequire(import.meta.url);

export class GlobalPushToTalkController {
  private addon: NativeGlobalPushToTalkAddon | null = null;
  private active = false;
  private held = false;
  private loadError: 'register' | 'native_unavailable' | undefined;
  private readonly platform: NodeJS.Platform;
  private readonly loadAddon: (path: string) => NativeGlobalPushToTalkAddon;

  constructor(private readonly options: GlobalPushToTalkControllerOptions) {
    this.platform = options.platform ?? process.platform;
    this.loadAddon =
      options.loadAddon ?? ((path) => nativeRequire(path) as NativeGlobalPushToTalkAddon);
  }

  configure(configuration: GlobalPushToTalkConfiguration): GlobalPushToTalkStatus {
    this.cancelHeldTurn();
    this.stopNativeHook();
    if (!configuration.enabled) return this.getStatus();
    if (this.platform !== 'win32') {
      return {
        available: false,
        active: false,
        message: localizeDesktopText(
          this.locale,
          'Global push-to-talk is supported only on Windows.',
          '全局按住说话仅支持 Windows。',
        ),
      };
    }

    const addon = this.getAddon();
    if (!addon) return this.getStatus();
    try {
      this.active = addon.start(configuration.key, (event) => this.handleNativeEvent(event));
      if (!this.active) this.loadError = 'register';
    } catch {
      this.active = false;
      this.loadError = 'register';
    }
    return this.getStatus();
  }

  cancelHeldTurn(): void {
    if (!this.held) return;
    this.held = false;
    this.options.onEvent({ type: 'cancel' });
  }

  dispose(): void {
    this.cancelHeldTurn();
    this.stopNativeHook();
  }

  getStatus(): GlobalPushToTalkStatus {
    if (this.platform !== 'win32') {
      return {
        available: false,
        active: false,
        message: localizeDesktopText(
          this.locale,
          'Global push-to-talk is supported only on Windows.',
          '全局按住说话仅支持 Windows。',
        ),
      };
    }
    if (!this.addon && !this.loadError) this.getAddon();
    if (this.loadError) {
      return {
        available: false,
        active: false,
        message:
          this.loadError === 'register'
            ? localizeDesktopText(
                this.locale,
                'Unable to register global push-to-talk input.',
                '无法注册全局按住说话输入。',
              )
            : localizeDesktopText(
                this.locale,
                'The native global push-to-talk module is unavailable.',
                '全局按住说话原生模块不可用。',
              ),
      };
    }
    return { available: Boolean(this.addon), active: this.active };
  }

  private get locale(): DesktopLocale {
    return this.options.getLocale?.() ?? 'zh-CN';
  }

  private getAddon(): NativeGlobalPushToTalkAddon | null {
    if (this.addon) return this.addon;
    try {
      this.addon = this.loadAddon(this.options.addonPath);
      return this.addon;
    } catch {
      this.loadError = 'native_unavailable';
      return null;
    }
  }

  private handleNativeEvent(event: GlobalPushToTalkEvent): void {
    if (!this.active) return;
    if (event.type === 'press') {
      if (this.held) return;
      this.held = true;
      this.options.onEvent(event);
      return;
    }
    if (!this.held) return;
    this.held = false;
    this.options.onEvent(event);
  }

  private stopNativeHook(): void {
    if (this.addon && this.active) this.addon.stop();
    this.active = false;
  }
}

export const getGlobalPushToTalkAddonPath = (options: {
  isPackaged: boolean;
  resourcesPath: string;
  projectRoot: string;
}): string =>
  options.isPackaged
    ? join(options.resourcesPath, 'native', 'global-push-to-talk.node')
    : join(
        options.projectRoot,
        'native',
        'global-ptt',
        'build',
        'Release',
        'global_push_to_talk.node',
      );
