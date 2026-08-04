import { contextBridge, ipcRenderer } from 'electron';
import type { GuideSourcesMessage } from '../../shared/guide-events.js';
import { exploreRequestSchema } from '../../shared/explore-contracts.js';
import type { ExploreRequest, ExploreResponse } from '../../shared/explore-contracts.js';
import type { SourceWindowState } from '../../shared/source-preview.js';
import {
  diagnosticConversationRecordSchema,
  diagnosticToolEventSchema,
} from '../../shared/desktop-diagnostics.js';
import { sourceMoreMenuActionSchema } from '../../shared/source-preview.js';
import type {
  DiagnosticConversationRecord,
  DiagnosticExportResult,
  DiagnosticToolEvent,
} from '../../shared/desktop-diagnostics.js';
import {
  desktopSettingsSaveRequestSchema,
  serviceCheckRequestSchema,
} from '../../shared/desktop-settings.js';
import type {
  DesktopSettingsSaveRequest,
  DesktopServiceSettings,
  DesktopTtsVoiceSample,
  ServiceCheckRequest,
  ServiceCheckResult,
} from '../../shared/desktop-settings.js';
import { globalPushToTalkConfigurationSchema } from '../../shared/global-push-to-talk.js';
import type {
  GlobalPushToTalkConfiguration,
  GlobalPushToTalkEvent,
  GlobalPushToTalkStatus,
} from '../../shared/global-push-to-talk.js';
import { aboutOpenLinkRequestSchema } from '../../shared/about-info.js';
import type { AboutInfo, AboutLinkId } from '../../shared/about-info.js';

contextBridge.exposeInMainWorld('desktop', {
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('assistant:set-collapsed', collapsed),
  getAssistantState: () => ipcRenderer.invoke('assistant:get-state'),
  setBallMenuOpen: (open: boolean) => ipcRenderer.invoke('assistant:set-menu-open', open),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  getAboutInfo: (): Promise<AboutInfo | null> => ipcRenderer.invoke('about:get-info'),
  openAboutLink: (id: AboutLinkId): Promise<boolean> => {
    const parsed = aboutOpenLinkRequestSchema.safeParse({ id });
    return parsed.success
      ? ipcRenderer.invoke('about:open-link', parsed.data)
      : Promise.resolve(false);
  },
  getGlobalPushToTalkStatus: (): Promise<GlobalPushToTalkStatus> =>
    ipcRenderer.invoke('voice:get-global-ptt-status'),
  configureGlobalPushToTalk: (configuration: GlobalPushToTalkConfiguration) => {
    const parsed = globalPushToTalkConfigurationSchema.safeParse(configuration);
    if (!parsed.success) {
      return Promise.resolve({
        available: false,
        active: false,
        message: '全局按住说话键无效。',
      } satisfies GlobalPushToTalkStatus);
    }
    return ipcRenderer.invoke(
      'voice:configure-global-ptt',
      parsed.data,
    ) as Promise<GlobalPushToTalkStatus>;
  },
  onGlobalPushToTalk: (callback: (event: GlobalPushToTalkEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, input: GlobalPushToTalkEvent) => {
      if (input?.type === 'press' || input?.type === 'release' || input?.type === 'cancel') {
        callback(input);
      }
    };
    ipcRenderer.on('voice:global-ptt', listener);
    return () => ipcRenderer.removeListener('voice:global-ptt', listener);
  },
  onLocaleChanged: (callback: (locale: 'en-US' | 'zh-CN') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, locale: 'en-US' | 'zh-CN') =>
      callback(locale);
    ipcRenderer.on('settings:locale-saved', listener);
    return () => ipcRenderer.removeListener('settings:locale-saved', listener);
  },
  getServiceCredentialStatus: () => ipcRenderer.invoke('settings:get-credential-status'),
  getVisibleLocalServiceCredentials: () =>
    ipcRenderer.invoke('settings:get-visible-local-credentials'),
  getServiceSettings: (): Promise<DesktopServiceSettings> =>
    ipcRenderer.invoke('settings:get-service-settings'),
  getTtsVoiceSamples: (): Promise<DesktopTtsVoiceSample[]> =>
    ipcRenderer.invoke('settings:get-tts-voice-samples'),
  saveSettings: (request: DesktopSettingsSaveRequest) => {
    const parsed = desktopSettingsSaveRequestSchema.safeParse(request);
    if (!parsed.success) {
      return Promise.resolve({
        ok: false as const,
        readiness: { status: 'error' as const, message: '设置格式无效。', issues: [] },
      });
    }
    return ipcRenderer.invoke('settings:save-settings', parsed.data);
  },
  testService: (request: ServiceCheckRequest): Promise<ServiceCheckResult> => {
    const parsed = serviceCheckRequestSchema.safeParse(request);
    if (!parsed.success) {
      return Promise.resolve({
        target: request.target,
        status: 'unavailable',
        message: '服务检测参数无效。',
      });
    }
    return ipcRenderer.invoke('settings:test-service', parsed.data);
  },
  openQuitDialog: () => ipcRenderer.invoke('app:open-quit-dialog'),
  closeUtilityWindow: () => ipcRenderer.invoke('utility:close'),
  quitApp: () => ipcRenderer.invoke('app:quit-confirmed'),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('assistant:set-always-on-top', enabled),
  openSource: (url: string) => ipcRenderer.invoke('source:open', url),
  openSourcePreview: (preview: GuideSourcesMessage) =>
    ipcRenderer.invoke('source:open-preview', preview),
  requestExplore: (request: ExploreRequest): Promise<ExploreResponse> => {
    const parsed = exploreRequestSchema.safeParse(request);
    return parsed.success
      ? ipcRenderer.invoke('explore:request', parsed.data)
      : Promise.resolve({ ok: false, code: 'configuration', message: '探索请求格式无效。' });
  },
  cancelExplore: () => ipcRenderer.invoke('explore:cancel') as Promise<boolean>,
  prefillExploreSuggestion: (text: string) =>
    ipcRenderer.send('explore:prefill-suggestion', { text }),
  onExplorePrefillSuggestion: (callback: (text: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('explore:prefill-suggestion', listener);
    return () => ipcRenderer.removeListener('explore:prefill-suggestion', listener);
  },
  getSourceState: (): Promise<SourceWindowState | null> => ipcRenderer.invoke('source:get-state'),
  onSourceState: (callback: (state: SourceWindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: SourceWindowState) =>
      callback(state);
    ipcRenderer.on('source:state', listener);
    return () => ipcRenderer.removeListener('source:state', listener);
  },
  selectSource: (url: string) => ipcRenderer.invoke('source:select', url),
  backToSources: () => ipcRenderer.invoke('source:back'),
  retrySource: () => ipcRenderer.invoke('source:retry'),
  navigateSource: (action: 'back' | 'forward' | 'reload' | 'stop') =>
    ipcRenderer.invoke('source:navigate', action) as Promise<boolean>,
  showSourceMoreMenu: () => ipcRenderer.invoke('source:show-more-menu') as Promise<boolean>,
  getSourceMoreMenuState: () =>
    ipcRenderer.invoke('source-more-menu:get-state') as Promise<
      import('../../shared/source-preview.js').SourceMoreMenuState | null
    >,
  onSourceMoreMenuState: (
    callback: (state: import('../../shared/source-preview.js').SourceMoreMenuState) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('../../shared/source-preview.js').SourceMoreMenuState,
    ) => callback(state);
    ipcRenderer.on('source-more-menu:state', listener);
    return () => ipcRenderer.removeListener('source-more-menu:state', listener);
  },
  performSourceMoreMenuAction: (action: unknown) => {
    const parsed = sourceMoreMenuActionSchema.safeParse(action);
    return parsed.success
      ? (ipcRenderer.invoke('source-more-menu:perform', parsed.data) as Promise<boolean>)
      : Promise.resolve(false);
  },
  closeSourceMoreMenu: () => ipcRenderer.invoke('source-more-menu:close'),
  openCurrentSourceExternal: () => ipcRenderer.invoke('source:open-current-external'),
  minimizeSource: () => ipcRenderer.invoke('source:minimize') as Promise<boolean>,
  closeSource: () => ipcRenderer.invoke('source:close'),
  setSourcePageZoom: (action: 'in' | 'out' | 'reset') =>
    ipcRenderer.invoke('source:set-page-zoom', action) as Promise<number | null>,
  setSourceReadingMode: (mode: 'mobile' | 'desktop') =>
    ipcRenderer.invoke('source:set-reading-mode', mode) as Promise<boolean>,
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  getReadiness: () => ipcRenderer.invoke('diagnostics:get-readiness'),
  retryReadiness: () => ipcRenderer.invoke('diagnostics:retry'),
  exportDiagnostics: (): Promise<DiagnosticExportResult> =>
    ipcRenderer.invoke('diagnostics:export'),
  recordDiagnosticConversation: (record: DiagnosticConversationRecord) => {
    const parsed = diagnosticConversationRecordSchema.safeParse(record);
    if (parsed.success) ipcRenderer.send('diagnostics:record-conversation', parsed.data);
  },
  recordDiagnosticToolEvent: (event: DiagnosticToolEvent) => {
    const parsed = diagnosticToolEventSchema.safeParse(event);
    if (parsed.success) ipcRenderer.send('diagnostics:record-tool-event', parsed.data);
  },
  openConfiguration: () => ipcRenderer.invoke('configuration:open'),
  createLiveKitSession: () => ipcRenderer.invoke('livekit:create-session'),
});
