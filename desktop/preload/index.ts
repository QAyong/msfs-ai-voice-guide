import { contextBridge, ipcRenderer } from 'electron';

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
  closeSource: () => ipcRenderer.invoke('source:close'),
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  getReadiness: () => ipcRenderer.invoke('diagnostics:get-readiness'),
  retryReadiness: () => ipcRenderer.invoke('diagnostics:retry'),
  openConfiguration: () => ipcRenderer.invoke('configuration:open'),
  createLiveKitSession: () => ipcRenderer.invoke('livekit:create-session'),
});
