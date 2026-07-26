/// <reference types="vite/client" />

export {};

import type { DesktopReadiness, DesktopSessionResult } from '../../../shared/desktop-contracts.js';
import type { GuideSourcesMessage } from '../../../shared/guide-events.js';
import type { SourceWindowState } from '../../../shared/source-preview.js';

declare global {
  interface Window {
    desktop?: {
      setCollapsed(collapsed: boolean): Promise<void>;
      getAssistantState(): Promise<{ collapsed: boolean }>;
      setBallMenuOpen(open: boolean): Promise<'up' | 'down'>;
      openSettings(): Promise<boolean>;
      saveLocale(locale: 'en-US' | 'zh-CN'): Promise<{
        ok: boolean;
        readiness: DesktopReadiness;
      }>;
      onLocaleChanged(callback: () => void): () => void;
      getServiceCredentialStatus(): Promise<{
        encryptionAvailable: boolean;
        configured: Record<string, boolean>;
        error?: string;
      }>;
      getVisibleLocalServiceCredentials(): Promise<{
        deepseekApiKey: string;
        sttAppId: string;
        sttAccessToken: string;
        ttsAppId: string;
        ttsAccessToken: string;
        searchApiKey: string;
      }>;
      saveServiceCredentials(credentials: Record<string, string>): Promise<{
        encryptionAvailable: boolean;
        configured: Record<string, boolean>;
        error?: string;
      }>;
      openQuitDialog(): Promise<boolean>;
      closeUtilityWindow(): Promise<void>;
      quitApp(): Promise<void>;
      setAlwaysOnTop(enabled: boolean): Promise<void>;
      openSource(url: string): Promise<boolean>;
      openSourcePreview(preview: GuideSourcesMessage): Promise<boolean>;
      getSourceState(): Promise<SourceWindowState | null>;
      onSourceState(callback: (state: SourceWindowState) => void): () => void;
      selectSource(url: string): Promise<boolean>;
      backToSources(): Promise<boolean>;
      retrySource(): Promise<boolean>;
      openCurrentSourceExternal(): Promise<boolean>;
      closeSource(): Promise<void>;
      setSourcePageZoom(action: 'in' | 'out' | 'reset'): Promise<number | null>;
      openExternal(url: string): Promise<void>;
      getReadiness(): Promise<DesktopReadiness>;
      retryReadiness(): Promise<DesktopReadiness>;
      openConfiguration(): Promise<boolean>;
      createLiveKitSession(): Promise<DesktopSessionResult>;
    };
  }
}
