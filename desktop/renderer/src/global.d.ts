/// <reference types="vite/client" />

export {};

import type { DesktopReadiness, DesktopSessionResult } from '../../../shared/desktop-contracts.js';
import type {
  DiagnosticConversationRecord,
  DiagnosticExportResult,
  DiagnosticToolEvent,
} from '../../../shared/desktop-diagnostics.js';
import type { GuideSourcesMessage } from '../../../shared/guide-events.js';
import type {
  ExploreNarrationRequest,
  ExploreNarrationResponse,
  ExploreRequest,
  ExploreResponse,
} from '../../../shared/explore-contracts.js';
import type { SourceWindowState } from '../../../shared/source-preview.js';
import type {
  DesktopSettingsSaveRequest,
  DesktopServiceSettings,
  DesktopToolSettings,
  DesktopTtsVoiceSample,
  ServiceCheckRequest,
  ServiceCheckResult,
} from '../../../shared/desktop-settings.js';
import type {
  MsfsConfigurationDiagnostic,
  MsfsConnectionStatus,
} from '../../../shared/msfs-desktop.js';
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
      getMsfsConnectionStatus(): Promise<MsfsConnectionStatus>;
      onMsfsConnectionStatus(callback: (status: MsfsConnectionStatus) => void): () => void;
      getAboutInfo(): Promise<AboutInfo | null>;
      openAboutLink(id: AboutLinkId): Promise<boolean>;
      getGlobalPushToTalkStatus(): Promise<GlobalPushToTalkStatus>;
      configureGlobalPushToTalk(
        configuration: GlobalPushToTalkConfiguration,
      ): Promise<GlobalPushToTalkStatus>;
      onGlobalPushToTalk(callback: (event: GlobalPushToTalkEvent) => void): () => void;
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
        bochaSearchApiKey: string;
      }>;
      getServiceSettings(): Promise<DesktopServiceSettings>;
      getMsfsToolSettings(): Promise<DesktopToolSettings>;
      checkMsfsConfiguration(): Promise<MsfsConfigurationDiagnostic>;
      getTtsVoiceSamples(): Promise<DesktopTtsVoiceSample[]>;
      saveSettings(
        request: DesktopSettingsSaveRequest,
      ): Promise<{ ok: boolean; readiness: DesktopReadiness }>;
      testService(request: ServiceCheckRequest): Promise<ServiceCheckResult>;
      openQuitDialog(): Promise<boolean>;
      closeUtilityWindow(): Promise<void>;
      quitApp(): Promise<void>;
      setAlwaysOnTop(enabled: boolean): Promise<void>;
      openSource(url: string): Promise<boolean>;
      openSourcePreview(preview: GuideSourcesMessage): Promise<boolean>;
      requestExplore(request: ExploreRequest): Promise<ExploreResponse>;
      cancelExplore(): Promise<boolean>;
      requestExploreNarration(request: ExploreNarrationRequest): Promise<ExploreNarrationResponse>;
      cancelExploreNarration(): Promise<boolean>;
      prefillExploreSuggestion(text: string): void;
      onExplorePrefillSuggestion(callback: (text: string) => void): () => void;
      getSourceState(): Promise<SourceWindowState | null>;
      markSourceRendererReady(): Promise<boolean>;
      onSourceState(callback: (state: SourceWindowState) => void): () => void;
      selectSource(url: string): Promise<boolean>;
      backToSources(): Promise<boolean>;
      retrySource(): Promise<boolean>;
      navigateSource(action: 'back' | 'forward' | 'reload' | 'stop'): Promise<boolean>;
      showSourceMoreMenu(): Promise<boolean>;
      getSourceMoreMenuState(): Promise<
        import('../../../shared/source-preview.js').SourceMoreMenuState | null
      >;
      onSourceMoreMenuState(
        callback: (state: import('../../../shared/source-preview.js').SourceMoreMenuState) => void,
      ): () => void;
      performSourceMoreMenuAction(action: unknown): Promise<boolean>;
      closeSourceMoreMenu(): Promise<void>;
      openCurrentSourceExternal(): Promise<boolean>;
      minimizeSource(): Promise<boolean>;
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
