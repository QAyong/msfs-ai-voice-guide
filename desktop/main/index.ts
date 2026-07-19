import { app, BrowserWindow, ipcMain, screen, shell, WebContentsView } from 'electron';
import { join } from 'node:path';
import type { AppConfig } from '../../src/config/schema.js';
import {
  guideSourcesMessageSchema,
  type GuideSource,
  type GuideSourcesMessage,
} from '../../shared/guide-events.js';
import {
  sourceDeviceModeSchema,
  type SourceDeviceMode,
  type SourceWindowState,
} from '../../shared/source-preview.js';
import type {
  DesktopReadiness,
  DesktopSessionResult,
  StoredWindowState,
} from '../../shared/desktop-contracts.js';
import { EmbeddedAgentRuntime } from './agent-runtime.js';
import { ensureLocalEnvironmentFile, reloadLocalEnvironment } from './environment.js';
import { checkDesktopConfiguration } from './readiness.js';
import { createDesktopSessionCredentials } from './session-token.js';
import { getIpadDeviceMetrics, getSourceUserAgent } from './source-device-mode.js';
import { isLiveWindow, releaseWindowReference } from './window-lifecycle.js';
import {
  dockToNearestSide,
  getExpandedBounds,
  keepTitleBarVisible,
  placeCompanionWindow,
  type DockSide,
} from './window-placement.js';
import { readStoredWindowState, writeStoredWindowState } from './window-state.js';

const assistantSize = { width: 320, height: 360 };
const collapsedSize = { width: 64, height: 72 };
const collapsedMenuSize = { width: 64, height: 174 };
const settingsSize = { width: 372, height: 536 };
const quitDialogSize = { width: 328, height: 224 };
const sourceLoadTimeoutMs = 15_000;

type MenuDirection = 'up' | 'down';
type UtilityKind = 'settings' | 'quit';

let assistantWindow: BrowserWindow | null = null;
let sourceWindow: BrowserWindow | null = null;
let sourceView: WebContentsView | null = null;
let sourceViewAttached = false;
let sourcePreview: GuideSourcesMessage | null = null;
let selectedSource: GuideSource | null = null;
let sourceWindowState: SourceWindowState | null = null;
let sourceDeviceMode: SourceDeviceMode = 'ipad';
let sourceLoadTimer: NodeJS.Timeout | null = null;
let utilityWindow: BrowserWindow | null = null;
let assistantCollapsed = false;
let assistantMenuOpen = false;
let assistantMenuDirection: MenuDirection = 'down';
let assistantDockSide: DockSide = 'right';
let isPositioningAssistant = false;
let expandedAssistantBounds: Electron.Rectangle | null = null;
let storedWindowState: StoredWindowState = {};
let persistWindowTimer: NodeJS.Timeout | null = null;

const agentRuntime = new EmbeddedAgentRuntime();

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);
const localConfigurationRoot = app.isPackaged ? app.getPath('userData') : process.cwd();
const localEnvironmentPath = join(localConfigurationRoot, '.env');
const localEnvironmentExamplePath = app.isPackaged
  ? join(process.resourcesPath, '.env.example')
  : join(localConfigurationRoot, '.env.example');

const getWindowStatePath = () => join(app.getPath('userData'), 'window-state.json');
const getAgentProcessPath = () => join(__dirname, 'agent-process.js');

const attachDevelopmentDiagnostics = (window: BrowserWindow) => {
  if (app.isPackaged) return;
  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') console.error(`[renderer] ${details.message}`);
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[renderer] load failed (${code}): ${description}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process gone: ${details.reason}`);
  });
};

const persistWindowState = () => {
  if (!isLiveWindow(assistantWindow)) return;
  const assistantBounds = assistantWindow.getBounds();
  const persistedAssistant = assistantMenuOpen
    ? {
        ...assistantBounds,
        y:
          assistantMenuDirection === 'up'
            ? assistantBounds.y + assistantBounds.height - collapsedSize.height
            : assistantBounds.y,
        width: collapsedSize.width,
        height: collapsedSize.height,
      }
    : assistantBounds;
  const sourceBounds = isLiveWindow(sourceWindow) ? sourceWindow.getBounds() : undefined;
  const next: StoredWindowState = {
    assistant: persistedAssistant,
    ...(expandedAssistantBounds ? { expandedAssistant: expandedAssistantBounds } : {}),
    ...(sourceBounds ? { source: { width: sourceBounds.width, height: sourceBounds.height } } : {}),
    collapsed: assistantCollapsed,
    dockSide: assistantDockSide,
  };
  storedWindowState = next;
  try {
    writeStoredWindowState(getWindowStatePath(), next);
  } catch {
    // Window state is a convenience; a read-only or damaged profile must not stop voice chat.
  }
};

const schedulePersistWindowState = () => {
  if (persistWindowTimer) clearTimeout(persistWindowTimer);
  persistWindowTimer = setTimeout(() => {
    persistWindowTimer = null;
    persistWindowState();
  }, 250);
};

const startConfiguredAgent = async (
  waitUntilReady: boolean,
): Promise<
  { config: AppConfig; readiness: DesktopReadiness } | { readiness: DesktopReadiness }
> => {
  reloadLocalEnvironment(localEnvironmentPath);
  const configuration = checkDesktopConfiguration();
  if (!configuration.ok) return { readiness: configuration.readiness };

  try {
    await agentRuntime.ensureStarted(configuration.config, getAgentProcessPath());
    if (waitUntilReady) await agentRuntime.waitUntilReady();
    return { config: configuration.config, readiness: agentRuntime.getReadiness() };
  } catch (error) {
    return {
      readiness: {
        status: 'error',
        message: 'AI 服务启动失败。',
        issues: [error instanceof Error ? error.message.slice(0, 320) : '请稍后重试。'],
      },
    };
  }
};

const loadRenderer = async (window: BrowserWindow, hash: string) => {
  if (isDevelopment) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`);
    return;
  }
  await window.loadFile(join(__dirname, '../renderer/index.html'), { hash });
};

const isAssistantSender = (sender: Electron.WebContents) =>
  Boolean(
    isLiveWindow(assistantWindow) &&
    !assistantWindow.webContents.isDestroyed() &&
    sender === assistantWindow.webContents,
  );

const isUtilitySender = (sender: Electron.WebContents) =>
  Boolean(
    isLiveWindow(utilityWindow) &&
    !utilityWindow.webContents.isDestroyed() &&
    sender === utilityWindow.webContents,
  );

const isSourceSender = (sender: Electron.WebContents) =>
  Boolean(
    isLiveWindow(sourceWindow) &&
    !sourceWindow.webContents.isDestroyed() &&
    sender === sourceWindow.webContents,
  );

const isSafeBrowserUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const isSafeInAppUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const setAssistantBounds = (bounds: Electron.Rectangle) => {
  if (!isLiveWindow(assistantWindow)) return;
  const window = assistantWindow;
  const currentBounds = window.getBounds();
  if (
    currentBounds.x === bounds.x &&
    currentBounds.y === bounds.y &&
    currentBounds.width === bounds.width &&
    currentBounds.height === bounds.height
  )
    return;
  isPositioningAssistant = true;
  window.setBounds(bounds);
  setTimeout(() => {
    isPositioningAssistant = false;
  }, 0);
};

const setAssistantMenuOpen = (open: boolean): MenuDirection => {
  if (!isLiveWindow(assistantWindow) || !assistantCollapsed || assistantMenuOpen === open) {
    return assistantMenuDirection;
  }

  const window = assistantWindow;
  const bounds = window.getBounds();
  if (open) {
    const display = screen.getDisplayMatching(bounds);
    const extraHeight = collapsedMenuSize.height - collapsedSize.height;
    const spaceBelow = display.workArea.y + display.workArea.height - (bounds.y + bounds.height);
    const spaceAbove = bounds.y - display.workArea.y;
    assistantMenuDirection = spaceBelow >= extraHeight || spaceBelow >= spaceAbove ? 'down' : 'up';
    window.setMinimumSize(collapsedMenuSize.width, collapsedMenuSize.height);
    setAssistantBounds({
      x: bounds.x,
      y: assistantMenuDirection === 'up' ? bounds.y - extraHeight : bounds.y,
      width: collapsedMenuSize.width,
      height: collapsedMenuSize.height,
    });
    assistantMenuOpen = true;
    return assistantMenuDirection;
  }

  const extraHeight = bounds.height - collapsedSize.height;
  window.setMinimumSize(collapsedSize.width, collapsedSize.height);
  setAssistantBounds({
    x: bounds.x,
    y: assistantMenuDirection === 'up' ? bounds.y + extraHeight : bounds.y,
    width: collapsedSize.width,
    height: collapsedSize.height,
  });
  assistantMenuOpen = false;
  return assistantMenuDirection;
};

const positionUtilityWindow = (window: BrowserWindow) => {
  if (!isLiveWindow(assistantWindow) || !isLiveWindow(window)) return;
  const assistantBounds = assistantWindow.getBounds();
  const display = screen.getDisplayMatching(assistantBounds);
  const utilityBounds = window.getBounds();
  const x = Math.round(
    display.workArea.x + Math.max(0, (display.workArea.width - utilityBounds.width) / 2),
  );
  const y = Math.round(
    display.workArea.y + Math.max(0, (display.workArea.height - utilityBounds.height) / 2),
  );
  window.setPosition(x, y);
};

const openUtilityWindow = async (kind: UtilityKind) => {
  if (!isLiveWindow(assistantWindow)) return;
  const parentWindow = assistantWindow;
  if (assistantMenuOpen) setAssistantMenuOpen(false);

  if (isLiveWindow(utilityWindow)) {
    if (utilityWindow.webContents.getURL().endsWith(`#${kind}`)) {
      utilityWindow.show();
      utilityWindow.focus();
      return;
    }
    utilityWindow.close();
  }

  const size = kind === 'settings' ? settingsSize : quitDialogSize;
  const window = new BrowserWindow({
    parent: parentWindow,
    width: size.width,
    height: size.height,
    minWidth: size.width,
    minHeight: size.height,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  utilityWindow = window;
  window.setAlwaysOnTop(true, 'floating');
  attachDevelopmentDiagnostics(window);
  window.on('close', () => {
    utilityWindow = releaseWindowReference(utilityWindow, window);
  });
  window.on('closed', () => {
    utilityWindow = releaseWindowReference(utilityWindow, window);
  });
  window.once('ready-to-show', () => {
    if (!isLiveWindow(window)) return;
    positionUtilityWindow(window);
    window.show();
    window.focus();
  });
  await loadRenderer(window, kind);
};

const setSourcePosition = (x: number, y: number) => {
  if (!isLiveWindow(sourceWindow)) return;
  const window = sourceWindow;
  const bounds = window.getBounds();
  if (bounds.x === x && bounds.y === y) return;
  window.setPosition(x, y);
};

const setSourceViewBounds = () => {
  if (!isLiveWindow(sourceWindow) || !sourceView || sourceView.webContents.isDestroyed()) return;
  const contentSize = sourceWindow.getContentSize();
  const width = contentSize[0] ?? 0;
  const height = contentSize[1] ?? 0;
  const viewHeight = Math.max(0, height - 48);
  sourceView.setBounds({ x: 0, y: 48, width, height: viewHeight });
  if (sourceViewAttached) {
    void applySourceDeviceMode(sourceView, width, viewHeight).catch((error: unknown) => {
      if (!app.isPackaged) console.error('[source-device-mode]', error);
    });
  }
};

async function applySourceDeviceMode(view: WebContentsView, width: number, height: number) {
  view.webContents.setUserAgent(
    getSourceUserAgent(sourceDeviceMode, process.versions.chrome ?? '120.0.0.0'),
  );
  if (sourceDeviceMode === 'ipad') {
    if (!view.webContents.debugger.isAttached()) view.webContents.debugger.attach('1.3');
    await view.webContents.debugger.sendCommand(
      'Emulation.setDeviceMetricsOverride',
      getIpadDeviceMetrics(width, height),
    );
    await view.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });
    return;
  }
  if (!view.webContents.debugger.isAttached()) return;
  await view.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
    enabled: false,
  });
  await view.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
  view.webContents.debugger.detach();
}

const clearSourceLoadTimer = () => {
  if (!sourceLoadTimer) return;
  clearTimeout(sourceLoadTimer);
  sourceLoadTimer = null;
};

const destroySourceView = () => {
  clearSourceLoadTimer();
  if (!sourceView) return;
  const view = sourceView;
  sourceView = null;
  if (sourceViewAttached && isLiveWindow(sourceWindow)) {
    sourceWindow.contentView.removeChildView(view);
  }
  sourceViewAttached = false;
  if (!view.webContents.isDestroyed()) {
    view.webContents.session.webRequest.onHeadersReceived(null);
    view.webContents.close();
  }
};

const publishSourceWindowState = (state: SourceWindowState) => {
  sourceWindowState = state;
  if (isLiveWindow(sourceWindow) && !sourceWindow.webContents.isDestroyed()) {
    sourceWindow.webContents.send('source:state', state);
  }
};

const attachSourceView = (view: WebContentsView) => {
  if (
    !isLiveWindow(sourceWindow) ||
    view.webContents.isDestroyed() ||
    sourceView !== view ||
    sourceViewAttached
  )
    return;
  sourceWindow.contentView.addChildView(view);
  sourceViewAttached = true;
  setSourceViewBounds();
};

const detachSourceView = (view: WebContentsView) => {
  if (
    !isLiveWindow(sourceWindow) ||
    view.webContents.isDestroyed() ||
    sourceView !== view ||
    !sourceViewAttached
  )
    return;
  sourceWindow.contentView.removeChildView(view);
  sourceViewAttached = false;
};

const failSourceLoad = (
  view: WebContentsView,
  currentUrl: string,
  error: Extract<SourceWindowState, { mode: 'error' }>['error'],
  message: string,
  statusCode?: number,
) => {
  if (!sourcePreview || !selectedSource || sourceView !== view) return;
  destroySourceView();
  publishSourceWindowState({
    mode: 'error',
    preview: sourcePreview,
    source: selectedSource,
    currentUrl,
    deviceMode: sourceDeviceMode,
    error,
    message,
    ...(statusCode ? { statusCode } : {}),
  });
};

const startSourceLoadTimer = (view: WebContentsView, currentUrl: string) => {
  clearSourceLoadTimer();
  sourceLoadTimer = setTimeout(() => {
    failSourceLoad(
      view,
      currentUrl,
      'timeout',
      '网页在 15 秒内没有完成加载，请重试或改用系统浏览器打开。',
    );
  }, sourceLoadTimeoutMs);
};

const dockAssistantWindow = (useCursorDisplay = true) => {
  if (!isLiveWindow(assistantWindow)) return;
  const bounds = assistantWindow.getBounds();
  const display = useCursorDisplay
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getDisplayMatching(bounds);
  const docked = dockToNearestSide(bounds, display.workArea);
  assistantDockSide = docked.side;
  setAssistantBounds({ ...bounds, x: docked.x, y: docked.y });
};

const constrainExpandedAssistant = (useCursorDisplay = true) => {
  if (!isLiveWindow(assistantWindow)) return;
  const bounds = assistantWindow.getBounds();
  const display = useCursorDisplay
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getDisplayMatching(bounds);
  setAssistantBounds(keepTitleBarVisible(bounds, display.workArea));
};

const positionSourceNextToAssistant = () => {
  if (!isLiveWindow(assistantWindow) || !isLiveWindow(sourceWindow)) return;
  const assistantBounds = assistantWindow.getBounds();
  const sourceBounds = sourceWindow.getBounds();
  const display = screen.getDisplayMatching(assistantBounds);
  const placement = placeCompanionWindow(assistantBounds, sourceBounds, display.workArea);
  setSourcePosition(placement.x, placement.y);
};

const handleAssistantMove = () => {
  if (!isLiveWindow(assistantWindow) || isPositioningAssistant) return;
  positionSourceNextToAssistant();
  schedulePersistWindowState();
};

const handleAssistantMoved = () => {
  if (!isLiveWindow(assistantWindow) || isPositioningAssistant) return;
  if (assistantCollapsed) dockAssistantWindow();
  else constrainExpandedAssistant();
  positionSourceNextToAssistant();
  schedulePersistWindowState();
};

const handleDisplayChange = () => {
  if (isLiveWindow(assistantWindow)) {
    if (assistantCollapsed) dockAssistantWindow(false);
    else constrainExpandedAssistant(false);
  }
  if (!isLiveWindow(sourceWindow)) return;
  positionSourceNextToAssistant();
};

type SourceLoadOptions = {
  url?: string;
  restoreScroll?: { x: number; y: number };
};

const showRemoteSource = async (source: GuideSource, options: SourceLoadOptions = {}) => {
  const initialUrl = options.url ?? source.url;
  if (!isLiveWindow(sourceWindow) || !sourcePreview || !isSafeInAppUrl(initialUrl)) return false;
  destroySourceView();
  selectedSource = source;
  let currentUrl = initialUrl;
  let pendingScrollPosition = options.restoreScroll;
  let responseStatusCode: number | undefined;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:source-preview',
      sandbox: true,
    },
  });
  sourceView = view;
  sourceViewAttached = false;
  view.webContents.setUserAgent(
    getSourceUserAgent(sourceDeviceMode, process.versions.chrome ?? '120.0.0.0'),
  );
  setSourceViewBounds();
  publishSourceWindowState({
    mode: 'loading',
    preview: sourcePreview,
    source,
    currentUrl,
    deviceMode: sourceDeviceMode,
  });
  startSourceLoadTimer(view, currentUrl);
  view.webContents.setWindowOpenHandler((details) => {
    if (isSafeBrowserUrl(details.url)) void shell.openExternal(details.url);
    return { action: 'deny' };
  });
  view.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  view.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.webContentsId === view.webContents.id && details.resourceType === 'mainFrame') {
      responseStatusCode = details.statusCode;
      currentUrl = details.url;
    }
    callback({});
  });
  view.webContents.on('will-navigate', (event, targetUrl) => {
    if (isSafeInAppUrl(targetUrl)) return;
    event.preventDefault();
    queueMicrotask(() =>
      failSourceLoad(view, currentUrl, 'blocked', '该页面尝试跳转到不受支持的地址。'),
    );
  });
  view.webContents.on('will-redirect', (event, targetUrl) => {
    if (isSafeInAppUrl(targetUrl)) return;
    event.preventDefault();
    queueMicrotask(() =>
      failSourceLoad(view, currentUrl, 'blocked', '该页面尝试跳转到不安全的 HTTP 地址。'),
    );
  });
  view.webContents.on('did-start-navigation', (_event, targetUrl, isInPlace, isMainFrame) => {
    if (!isMainFrame || isInPlace || !isSafeInAppUrl(targetUrl) || sourceView !== view) return;
    currentUrl = targetUrl;
    responseStatusCode = undefined;
    detachSourceView(view);
    publishSourceWindowState({
      mode: 'loading',
      preview: sourcePreview!,
      source,
      currentUrl,
      deviceMode: sourceDeviceMode,
    });
    startSourceLoadTimer(view, currentUrl);
  });
  view.webContents.on('did-finish-load', () => {
    if (!sourcePreview || sourceView !== view) return;
    if (responseStatusCode && responseStatusCode >= 400) {
      failSourceLoad(
        view,
        currentUrl,
        'http',
        `网站返回了 HTTP ${responseStatusCode}，页面无法在应用内显示。`,
        responseStatusCode,
      );
      return;
    }
    clearSourceLoadTimer();
    attachSourceView(view);
    publishSourceWindowState({
      mode: 'ready',
      preview: sourcePreview,
      source,
      currentUrl,
      deviceMode: sourceDeviceMode,
    });
    if (pendingScrollPosition) {
      const { x, y } = pendingScrollPosition;
      pendingScrollPosition = undefined;
      void view.webContents
        .executeJavaScript(`window.scrollTo(${Math.round(x)}, ${Math.round(y)})`)
        .catch(() => undefined);
    }
  });
  view.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || sourceView !== view) return;
      failSourceLoad(
        view,
        isSafeInAppUrl(validatedUrl) ? validatedUrl : currentUrl,
        responseStatusCode && responseStatusCode >= 400 ? 'http' : 'network',
        responseStatusCode && responseStatusCode >= 400
          ? `网站返回了 HTTP ${responseStatusCode}，页面无法在应用内显示。`
          : `网络加载失败（${errorCode}：${errorDescription}）。`,
        responseStatusCode && responseStatusCode >= 400 ? responseStatusCode : undefined,
      );
    },
  );
  view.webContents.on('render-process-gone', () => {
    failSourceLoad(view, currentUrl, 'renderer', '网页渲染进程意外退出，请重试。');
  });
  try {
    await view.webContents.loadURL(initialUrl);
    return sourceView === view;
  } catch (error) {
    if (sourceView === view) {
      failSourceLoad(
        view,
        currentUrl,
        'network',
        error instanceof Error ? `网络加载失败：${error.message}` : '网络加载失败。',
      );
    }
    return false;
  }
};

const createAssistantWindow = async () => {
  const savedBounds = storedWindowState.assistant;
  assistantCollapsed = storedWindowState.collapsed ?? false;
  assistantDockSide = storedWindowState.dockSide ?? 'right';
  expandedAssistantBounds = storedWindowState.expandedAssistant ?? null;
  const initialSize = assistantCollapsed ? collapsedSize : assistantSize;
  const window = new BrowserWindow({
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    width: assistantCollapsed ? collapsedSize.width : (savedBounds?.width ?? initialSize.width),
    height: assistantCollapsed ? collapsedSize.height : (savedBounds?.height ?? initialSize.height),
    minWidth: assistantCollapsed ? collapsedSize.width : 240,
    minHeight: assistantCollapsed ? collapsedSize.height : 220,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  assistantWindow = window;
  window.setAlwaysOnTop(true, 'floating');
  attachDevelopmentDiagnostics(window);
  window.on('close', (event) => {
    if (shutdownComplete) {
      assistantWindow = releaseWindowReference(assistantWindow, window);
      if (isLiveWindow(sourceWindow)) sourceWindow.close();
      if (isLiveWindow(utilityWindow)) utilityWindow.close();
      return;
    }
    event.preventDefault();
    app.quit();
  });
  window.on('closed', () => {
    assistantWindow = releaseWindowReference(assistantWindow, window);
    if (isLiveWindow(sourceWindow)) sourceWindow.close();
    if (isLiveWindow(utilityWindow)) utilityWindow.close();
  });
  window.on('move', handleAssistantMove);
  window.on('moved', handleAssistantMoved);
  window.on('resize', () => {
    if (!assistantCollapsed && !assistantMenuOpen)
      expandedAssistantBounds = isLiveWindow(window) ? window.getBounds() : null;
    positionSourceNextToAssistant();
    schedulePersistWindowState();
  });
  if (assistantCollapsed) dockAssistantWindow(false);
  else constrainExpandedAssistant(false);
  await loadRenderer(window, 'assistant');
};

const createSourceWindow = async () => {
  if (!isLiveWindow(assistantWindow)) return;
  const parentWindow = assistantWindow;
  const savedSourceSize = storedWindowState.source;
  const window = new BrowserWindow({
    parent: parentWindow,
    width: savedSourceSize?.width ?? 440,
    height: savedSourceSize?.height ?? 600,
    minWidth: 280,
    minHeight: 240,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  sourceWindow = window;
  window.setAlwaysOnTop(true, 'floating');
  attachDevelopmentDiagnostics(window);
  window.on('resize', () => {
    if (sourceWindow !== window || !isLiveWindow(window)) return;
    setSourceViewBounds();
    schedulePersistWindowState();
  });
  window.on('moved', () => {
    if (sourceWindow === window && isLiveWindow(window)) positionSourceNextToAssistant();
  });
  const releaseSourceWindow = () => {
    if (sourceWindow !== window) return;
    destroySourceView();
    sourceWindow = releaseWindowReference(sourceWindow, window);
    sourcePreview = null;
    selectedSource = null;
    sourceWindowState = null;
    sourceDeviceMode = 'ipad';
  };
  window.on('close', releaseSourceWindow);
  window.on('closed', releaseSourceWindow);
  await loadRenderer(window, 'source');
};

ipcMain.handle('assistant:set-collapsed', (event, collapsed: boolean) => {
  if (!isLiveWindow(assistantWindow) || !isAssistantSender(event.sender)) return;
  const window = assistantWindow;
  const currentDisplay = screen.getDisplayMatching(window.getBounds());
  if (assistantMenuOpen) setAssistantMenuOpen(false);
  assistantCollapsed = collapsed;
  if (collapsed) {
    expandedAssistantBounds = window.getBounds();
    if (isLiveWindow(sourceWindow)) sourceWindow.close();
    window.setMinimumSize(collapsedSize.width, collapsedSize.height);
    window.setSize(collapsedSize.width, collapsedSize.height);
    dockAssistantWindow(false);
    schedulePersistWindowState();
    return;
  }
  window.setMinimumSize(240, 220);
  const restored = expandedAssistantBounds
    ? keepTitleBarVisible(expandedAssistantBounds, currentDisplay.workArea)
    : getExpandedBounds(
        currentDisplay.workArea,
        assistantDockSide,
        window.getBounds().y,
        assistantSize,
      );
  setAssistantBounds(restored);
  schedulePersistWindowState();
});

ipcMain.handle('assistant:set-menu-open', (event, open: boolean) => {
  if (!isAssistantSender(event.sender)) return assistantMenuDirection;
  return setAssistantMenuOpen(open);
});

ipcMain.handle('assistant:get-state', (event) => {
  if (!isAssistantSender(event.sender)) return { collapsed: false };
  return { collapsed: assistantCollapsed };
});

ipcMain.handle('diagnostics:get-readiness', async (event) => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) {
    return {
      status: 'error',
      message: '不允许的诊断请求。',
      issues: [],
    } satisfies DesktopReadiness;
  }
  const result = await startConfiguredAgent(false);
  return result.readiness;
});

ipcMain.handle('diagnostics:retry', async (event) => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) {
    return {
      status: 'error',
      message: '不允许的诊断请求。',
      issues: [],
    } satisfies DesktopReadiness;
  }
  const result = await startConfiguredAgent(true);
  return result.readiness;
});

ipcMain.handle('configuration:open', async (event) => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) return false;
  try {
    ensureLocalEnvironmentFile(localEnvironmentPath, localEnvironmentExamplePath);
    const errorMessage = await shell.openPath(localEnvironmentPath);
    return errorMessage === '';
  } catch {
    return false;
  }
});

ipcMain.handle('livekit:create-session', async (event): Promise<DesktopSessionResult> => {
  if (!isAssistantSender(event.sender)) {
    return {
      ok: false,
      readiness: { status: 'error', message: '不允许的会话请求。', issues: [] },
    };
  }
  const result = await startConfiguredAgent(true);
  if (!('config' in result) || result.readiness.status !== 'ready') {
    return { ok: false, readiness: result.readiness };
  }
  return { ok: true, credentials: await createDesktopSessionCredentials(result.config) };
});

ipcMain.handle('settings:open', async (event) => {
  if (!isAssistantSender(event.sender)) return;
  await openUtilityWindow('settings');
});

ipcMain.handle('app:open-quit-dialog', async (event) => {
  if (!isAssistantSender(event.sender)) return;
  await openUtilityWindow('quit');
});

ipcMain.handle('utility:close', (event) => {
  if (isUtilitySender(event.sender) && isLiveWindow(utilityWindow)) utilityWindow.close();
});

ipcMain.handle('app:quit-confirmed', (event) => {
  if (isUtilitySender(event.sender)) app.quit();
});

ipcMain.handle('assistant:set-always-on-top', (event, enabled: boolean) => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) return;
  if (isLiveWindow(assistantWindow)) {
    assistantWindow.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
  }
});

ipcMain.handle('source:open', async (event, url: string) => {
  if (
    !isLiveWindow(assistantWindow) ||
    !isAssistantSender(event.sender) ||
    !isSafeBrowserUrl(url)
  ) {
    return false;
  }
  if (!isSafeInAppUrl(url)) {
    await shell.openExternal(url);
    return true;
  }
  const hostname = new URL(url).hostname;
  const preview = guideSourcesMessageSchema.parse({
    type: 'guide.sources',
    sources: [{ rank: 1, title: hostname, siteName: hostname, url, openMode: 'in_app' }],
  });
  sourceDeviceMode = 'ipad';
  sourcePreview = preview;
  selectedSource = preview.sources[0] ?? null;
  if (!isLiveWindow(sourceWindow)) await createSourceWindow();
  if (!isLiveWindow(sourceWindow)) return false;
  positionSourceNextToAssistant();
  sourceWindow.show();
  return selectedSource ? showRemoteSource(selectedSource) : false;
});

ipcMain.handle('source:open-preview', async (event, value: unknown) => {
  if (!isLiveWindow(assistantWindow) || !isAssistantSender(event.sender)) return false;
  const parsed = guideSourcesMessageSchema.safeParse(value);
  if (!parsed.success || parsed.data.sources.length === 0) return false;
  sourceDeviceMode = 'ipad';
  sourcePreview = parsed.data;
  selectedSource = null;
  destroySourceView();
  publishSourceWindowState({ mode: 'preview', preview: parsed.data });
  if (!isLiveWindow(sourceWindow)) await createSourceWindow();
  if (!isLiveWindow(sourceWindow)) return false;
  positionSourceNextToAssistant();
  sourceWindow.show();
  sourceWindow.focus();
  publishSourceWindowState({ mode: 'preview', preview: parsed.data });
  return true;
});

ipcMain.handle('source:get-state', (event) =>
  isSourceSender(event.sender) ? sourceWindowState : null,
);

ipcMain.handle('source:select', async (event, url: string) => {
  if (!isSourceSender(event.sender) || !sourcePreview) return false;
  const source = sourcePreview.sources.find((candidate) => candidate.url === url);
  if (!source) return false;
  if (source.openMode === 'external') {
    await shell.openExternal(source.url);
    return true;
  }
  return showRemoteSource(source);
});

ipcMain.handle('source:back', (event) => {
  if (!isSourceSender(event.sender) || !sourcePreview) return false;
  destroySourceView();
  selectedSource = null;
  publishSourceWindowState({ mode: 'preview', preview: sourcePreview });
  return true;
});

ipcMain.handle('source:retry', (event) => {
  if (!isSourceSender(event.sender) || !selectedSource) return false;
  const retryUrl =
    sourceWindowState && sourceWindowState.mode !== 'preview'
      ? sourceWindowState.currentUrl
      : selectedSource.url;
  return showRemoteSource(selectedSource, { url: retryUrl });
});

ipcMain.handle('source:set-device-mode', async (event, value: unknown) => {
  if (
    !isSourceSender(event.sender) ||
    !selectedSource ||
    !sourceWindowState ||
    sourceWindowState.mode === 'preview'
  ) {
    return false;
  }
  const parsed = sourceDeviceModeSchema.safeParse(value);
  if (!parsed.success || parsed.data === sourceDeviceMode) return parsed.success;

  const currentUrl = sourceWindowState.currentUrl;
  let restoreScroll: { x: number; y: number } | undefined;
  if (sourceWindowState.mode === 'ready' && sourceView) {
    try {
      const position: unknown = await sourceView.webContents.executeJavaScript(
        '({ x: window.scrollX, y: window.scrollY })',
      );
      if (
        position &&
        typeof position === 'object' &&
        'x' in position &&
        'y' in position &&
        typeof position.x === 'number' &&
        typeof position.y === 'number' &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y)
      ) {
        restoreScroll = { x: position.x, y: position.y };
      }
    } catch {
      // Scroll restoration is a convenience; device switching must still continue.
    }
  }

  sourceDeviceMode = parsed.data;
  return showRemoteSource(selectedSource, {
    url: currentUrl,
    ...(restoreScroll ? { restoreScroll } : {}),
  });
});

ipcMain.handle('source:open-current-external', async (event) => {
  if (!isSourceSender(event.sender) || !selectedSource) return false;
  const currentUrl =
    sourceWindowState && sourceWindowState.mode !== 'preview'
      ? sourceWindowState.currentUrl
      : selectedSource.url;
  if (!isSafeBrowserUrl(currentUrl)) return false;
  await shell.openExternal(currentUrl);
  return true;
});

ipcMain.handle('source:close', (event) => {
  if (isSourceSender(event.sender) && isLiveWindow(sourceWindow)) sourceWindow.close();
});

ipcMain.handle('external:open', (event, url: string) => {
  const trustedSender = isAssistantSender(event.sender) || isSourceSender(event.sender);
  return trustedSender && isSafeBrowserUrl(url) ? shell.openExternal(url) : undefined;
});

app.whenReady().then(async () => {
  storedWindowState = readStoredWindowState(getWindowStatePath());
  await createAssistantWindow();
  void startConfiguredAgent(false).then(async (result) => {
    if ('config' in result) await agentRuntime.waitUntilReady();
    if (!app.isPackaged) {
      console.error(`[agent-readiness] ${JSON.stringify(agentRuntime.getReadiness())}`);
    }
  });
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let shutdownStarted = false;
let shutdownComplete = false;
app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  if (persistWindowTimer) {
    clearTimeout(persistWindowTimer);
    persistWindowTimer = null;
  }
  persistWindowState();
  void agentRuntime.stop().finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
app.on('activate', () => {
  if (!isLiveWindow(assistantWindow)) void createAssistantWindow();
});
