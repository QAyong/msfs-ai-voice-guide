/// <reference types="vite/client" />

export {};

import type { DesktopReadiness, DesktopSessionResult } from '../../../shared/desktop-contracts.js';
import type { GuideSourcesMessage } from '../../../shared/guide-events.js';
import type { SourceWindowState } from '../../../shared/source-preview.js';
import type {
  DesktopServiceSettings,
  ServiceCheckRequest,
  ServiceCheckResult,
  ServiceSettingsSaveRequest,
} from '../../../shared/desktop-settings.js';

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
      getServiceSettings(): Promise<DesktopServiceSettings>;
      saveServiceSettings(
        request: ServiceSettingsSaveRequest,
      ): Promise<{ ok: true; transitionId: string } | { ok: false; readiness: DesktopReadiness }>;
      testService(request: ServiceCheckRequest): Promise<ServiceCheckResult>;
      onServiceReconnectNeeded(callback: (transitionId: string) => void): () => void;
      completeServiceReconnect(transitionId: string): Promise<{ ok: boolean; message: string }>;
      rollbackServiceReconnect(transitionId: string): Promise<void>;
      onServiceTransitionResult(
        callback: (result: { ok: boolean; message: string }) => void,
      ): () => void;
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
