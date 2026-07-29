/// <reference types="vite/client" />

export {};

import type { DesktopReadiness, DesktopSessionResult } from '../../../shared/desktop-contracts.js';
import type {
  DiagnosticConversationRecord,
  DiagnosticExportResult,
  DiagnosticToolEvent,
} from '../../../shared/desktop-diagnostics.js';
import type { GuideSourcesMessage } from '../../../shared/guide-events.js';
import type { SourceWindowState } from '../../../shared/source-preview.js';
import type {
  DesktopServiceSettings,
  ServiceCheckRequest,
  ServiceCheckResult,
  ServiceSettingsSaveRequest,
} from '../../../shared/desktop-settings.js';
import type {
  GlobalPushToTalkConfiguration,
  GlobalPushToTalkEvent,
  GlobalPushToTalkStatus,
} from '../../../shared/global-push-to-talk.js';
import type { AboutInfo, AboutLinkId } from '../../../shared/about-info.js';

declare global {
  interface Window {
    desktop?: {
      setCollapsed(collapsed: boolean): Promise<void>;
      getAssistantState(): Promise<{ collapsed: boolean }>;
      setBallMenuOpen(open: boolean): Promise<'up' | 'down'>;
      openSettings(): Promise<boolean>;
      getAboutInfo(): Promise<AboutInfo | null>;
      openAboutLink(id: AboutLinkId): Promise<boolean>;
      getGlobalPushToTalkStatus(): Promise<GlobalPushToTalkStatus>;
      configureGlobalPushToTalk(
        configuration: GlobalPushToTalkConfiguration,
      ): Promise<GlobalPushToTalkStatus>;
      onGlobalPushToTalk(callback: (event: GlobalPushToTalkEvent) => void): () => void;
      saveLocale(locale: 'en-US' | 'zh-CN'): Promise<{
        ok: boolean;
        readiness: DesktopReadiness;
      }>;
      onLocaleChanged(callback: (locale: 'en-US' | 'zh-CN') => void): () => void;
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
      setSourceReadingMode(mode: 'mobile' | 'desktop'): Promise<boolean>;
      openExternal(url: string): Promise<void>;
      getReadiness(): Promise<DesktopReadiness>;
      retryReadiness(): Promise<DesktopReadiness>;
      exportDiagnostics(): Promise<DiagnosticExportResult>;
      recordDiagnosticConversation(record: DiagnosticConversationRecord): void;
      recordDiagnosticToolEvent(event: DiagnosticToolEvent): void;
      openConfiguration(): Promise<boolean>;
      createLiveKitSession(): Promise<DesktopSessionResult>;
    };
  }
}
