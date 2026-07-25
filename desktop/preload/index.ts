import { contextBridge, ipcRenderer } from 'electron';
import type { GuideSourcesMessage } from '../../shared/guide-events.js';
import type { SourceWindowState } from '../../shared/source-preview.js';

contextBridge.exposeInMainWorld('desktop', {
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('assistant:set-collapsed', collapsed),
  getAssistantState: () => ipcRenderer.invoke('assistant:get-state'),
  setBallMenuOpen: (open: boolean) => ipcRenderer.invoke('assistant:set-menu-open', open),
  openSettings: () => ipcRenderer.invoke('settings:open'),
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
