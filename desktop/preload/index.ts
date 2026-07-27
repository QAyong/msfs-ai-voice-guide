import { contextBridge, ipcRenderer } from 'electron';
import type { GuideSourcesMessage } from '../../shared/guide-events.js';
import type { SourceWindowState } from '../../shared/source-preview.js';
import {
  serviceCheckRequestSchema,
  serviceSettingsSaveRequestSchema,
} from '../../shared/desktop-settings.js';
import type {
  DesktopServiceSettings,
  ServiceCheckRequest,
  ServiceCheckResult,
  ServiceSettingsSaveRequest,
} from '../../shared/desktop-settings.js';

contextBridge.exposeInMainWorld('desktop', {
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('assistant:set-collapsed', collapsed),
  getAssistantState: () => ipcRenderer.invoke('assistant:get-state'),
  setBallMenuOpen: (open: boolean) => ipcRenderer.invoke('assistant:set-menu-open', open),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  saveLocale: (locale: 'en-US' | 'zh-CN') => ipcRenderer.invoke('settings:save-locale', locale),
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
  saveServiceSettings: (request: ServiceSettingsSaveRequest) => {
    const parsed = serviceSettingsSaveRequestSchema.safeParse(request);
    if (!parsed.success) {
      return Promise.resolve({
        ok: false as const,
        readiness: { status: 'error' as const, message: '服务配置格式无效。', issues: [] },
      });
    }
    return ipcRenderer.invoke('settings:save-service-settings', parsed.data);
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
  onServiceReconnectNeeded: (callback: (transitionId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, transitionId: string) =>
      callback(transitionId);
    ipcRenderer.on('settings:service-reconnect-needed', listener);
    return () => ipcRenderer.removeListener('settings:service-reconnect-needed', listener);
  },
  completeServiceReconnect: (transitionId: string) =>
    ipcRenderer.invoke('settings:complete-service-reconnect', transitionId),
  rollbackServiceReconnect: (transitionId: string) =>
    ipcRenderer.invoke('settings:rollback-service-reconnect', transitionId),
  onServiceTransitionResult: (callback: (result: { ok: boolean; message: string }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      result: { ok: boolean; message: string },
    ) => callback(result);
    ipcRenderer.on('settings:service-transition-result', listener);
    return () => ipcRenderer.removeListener('settings:service-transition-result', listener);
  },
  openQuitDialog: () => ipcRenderer.invoke('app:open-quit-dialog'),
  closeUtilityWindow: () => ipcRenderer.invoke('utility:close'),
  quitApp: () => ipcRenderer.invoke('app:quit-confirmed'),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke('assistant:set-always-on-top', enabled),
  openSource: (url: string) => ipcRenderer.invoke('source:open', url),
  openSourcePreview: (preview: GuideSourcesMessage) =>
    ipcRenderer.invoke('source:open-preview', preview),
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
  openCurrentSourceExternal: () => ipcRenderer.invoke('source:open-current-external'),
  closeSource: () => ipcRenderer.invoke('source:close'),
  setSourcePageZoom: (action: 'in' | 'out' | 'reset') =>
    ipcRenderer.invoke('source:set-page-zoom', action) as Promise<number | null>,
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  getReadiness: () => ipcRenderer.invoke('diagnostics:get-readiness'),
  retryReadiness: () => ipcRenderer.invoke('diagnostics:retry'),
  openConfiguration: () => ipcRenderer.invoke('configuration:open'),
  createLiveKitSession: () => ipcRenderer.invoke('livekit:create-session'),
});
