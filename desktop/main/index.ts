import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  screen,
  shell,
  WebContentsView,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AppConfig } from '../../src/config/schema.js';
import {
  guideSourcesMessageSchema,
  type GuideSource,
  type GuideSourcesMessage,
} from '../../shared/guide-events.js';
import type { SourceWindowState } from '../../shared/source-preview.js';
import type {
  DesktopReadiness,
  DesktopSessionResult,
  StoredWindowState,
} from '../../shared/desktop-contracts.js';
import {
  diagnosticConversationRecordSchema,
  diagnosticToolEventSchema,
  type DiagnosticExportResult,
} from '../../shared/desktop-diagnostics.js';
import {
  defaultDesktopServiceSettings,
  desktopServiceSettingsSchema,
  serviceCredentialKeys,
  serviceCredentialUpdatesSchema,
  serviceCheckRequestSchema,
  serviceSettingsSaveRequestSchema,
  supportedLocaleSchema,
  type DesktopServiceSettings,
  type ServiceCredentialKey,
  type ServiceCredentialStatus,
  type ServiceCheckResult,
  type ServiceSettingsSaveRequest,
  type StoredServiceCredentials,
} from '../../shared/desktop-settings.js';
import {
  globalPushToTalkConfigurationSchema,
  type GlobalPushToTalkEvent,
  type GlobalPushToTalkStatus,
} from '../../shared/global-push-to-talk.js';
import {
  aboutLinkSchema,
  aboutInfoSchema,
  aboutOpenLinkRequestSchema,
  type AboutInfo,
  type AboutLink,
} from '../../shared/about-info.js';
import { EmbeddedAgentRuntime } from './agent-runtime.js';
import {
  ensureLocalEnvironmentFile,
  getInheritedEnvironment,
  reloadLocalEnvironment,
} from './environment.js';
import {
  LocalLiveKitRuntime,
  applyLocalLiveKitEnvironment,
  getLocalLiveKitServerPath,
} from './local-livekit-runtime.js';
import {
  checkDesktopConfiguration,
  localLiveKitFailureReadiness,
  workerFailureReadiness,
} from './readiness.js';
import { createDesktopSessionCredentials } from './session-token.js';
import { getSourceViewBounds } from './source-view-bounds.js';
import {
  SOURCE_PAGE_ZOOM_DEFAULT_PERCENT,
  clampSourcePageZoomPercent,
  resetSourcePageZoomPercent,
  sourcePageZoomFactorFromPercent,
  stepSourcePageZoomPercent,
  type SourcePageZoomDirection,
} from '../../shared/source-page-zoom.js';
import {
  shouldFollowAssistantWindow,
  startSourceWindowSession,
  updateSourceWindowFollowMode,
  type SourceWindowFollowMode,
} from './source-window-follow.js';
import { isLiveWindow, releaseWindowReference } from './window-lifecycle.js';
import {
  dockToNearestSide,
  getExpandedBounds,
  getRestorableSize,
  keepTitleBarVisible,
  placeCompanionWindow,
  type DockSide,
} from './window-placement.js';
import { readStoredWindowState, writeStoredWindowState } from './window-state.js';
import {
  applyDesktopServiceSettings,
  mergeCredentialUpdates,
  serviceSettingsFromConfig,
} from './service-settings.js';
import { ServiceAvailabilityChecker } from './service-checks.js';
import { getGlobalPushToTalkAddonPath, GlobalPushToTalkController } from './global-push-to-talk.js';
import { DiagnosticLogger, writeDiagnosticArchive } from './diagnostics.js';

const assistantSize = { width: 320, height: 360 };
const collapsedSize = { width: 64, height: 72 };
const collapsedMenuSize = { width: 64, height: 174 };
const sourceSize = { width: 440, height: 600 };
const settingsSize = { width: 620, height: 640 };
const quitDialogSize = { width: 328, height: 224 };
const sourceLoadTimeoutMs = 15_000;

type MenuDirection = 'up' | 'down';
type UtilityKind = 'settings' | 'quit';
type GuideLocale = 'en-US' | 'zh-CN';
type VisibleServiceCredentials = Record<ServiceCredentialKey, string>;

let assistantWindow: BrowserWindow | null = null;
let sourceWindow: BrowserWindow | null = null;
let sourceView: WebContentsView | null = null;
let sourceViewAttached = false;
let sourceViewLoad: ((source: GuideSource, initialUrl: string) => void) | null = null;
let sourcePreview: GuideSourcesMessage | null = null;
let selectedSource: GuideSource | null = null;
let sourceWindowState: SourceWindowState | null = null;
let sourceLoadTimer: NodeJS.Timeout | null = null;
let sourceViewPrewarm: Promise<WebContentsView | null> | null = null;
let sourcePageZoomPercent = SOURCE_PAGE_ZOOM_DEFAULT_PERCENT;
let utilityWindow: BrowserWindow | null = null;
let assistantCollapsed = false;
let assistantMenuOpen = false;
let assistantMenuDirection: MenuDirection = 'down';
let assistantDockSide: DockSide = 'right';
let isPositioningAssistant = false;
let isPositioningSource = false;
let sourceWindowFollowMode: SourceWindowFollowMode = startSourceWindowSession();
let expandedAssistantBounds: Electron.Rectangle | null = null;
let storedWindowState: StoredWindowState = {};
let persistWindowTimer: NodeJS.Timeout | null = null;

let diagnosticsLogger: DiagnosticLogger | null = null;
const getDiagnosticsLogger = () => {
  diagnosticsLogger ??= new DiagnosticLogger({
    directory: join(app.getPath('userData'), 'diagnostics'),
  });
  return diagnosticsLogger;
};
const createAgentRuntime = (healthPort = 8098) =>
  new EmbeddedAgentRuntime(healthPort, (stream, message) => {
    void getDiagnosticsLogger().append('worker', { stream, message });
  });
let agentRuntime = createAgentRuntime();
const localLiveKitRuntime = new LocalLiveKitRuntime();
const serviceAvailabilityChecker = new ServiceAvailabilityChecker();
let guideLocale: GuideLocale = 'zh-CN';

type PendingServiceTransition = {
  id: string;
  runtime: EmbeddedAgentRuntime;
  config: AppConfig;
  services: DesktopServiceSettings;
  credentials: StoredServiceCredentials;
  persistCredentials: boolean;
};
let pendingServiceTransition: PendingServiceTransition | null = null;

const aboutLinks: readonly AboutLink[] = [];

const getAboutInfo = (): AboutInfo =>
  aboutInfoSchema.parse({
    schemaVersion: 1,
    productName: '晓晓飞行导游',
    version: app.getVersion(),
    supportChannels: [
      { id: 'wechat', label: '微信', qrAsset: 'wechat-qr' },
      { id: 'alipay', label: '支付宝', qrAsset: 'alipay-qr' },
    ],
    links: aboutLinks,
  });

const openAboutLink = async (value: unknown): Promise<boolean> => {
  const request = aboutOpenLinkRequestSchema.safeParse(value);
  if (!request.success) return false;
  const link = aboutLinks.find((candidate) => candidate.id === request.data.id);
  if (!link) return false;
  const parsed = aboutLinkSchema.safeParse(link);
  if (!parsed.success || new URL(parsed.data.url).protocol !== 'https:') return false;
  await shell.openExternal(parsed.data.url);
  return true;
};

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL);
const localConfigurationRoot = app.isPackaged ? app.getPath('userData') : process.cwd();
const localEnvironmentPath = join(localConfigurationRoot, '.env');
const localEnvironmentExamplePath = app.isPackaged
  ? join(process.resourcesPath, '.env.example')
  : join(localConfigurationRoot, '.env.example');

const getWindowStatePath = () => join(app.getPath('userData'), 'window-state.json');
const getGuideLocalePath = () => join(app.getPath('userData'), 'guide-locale.json');
const getServiceSettingsPath = () => join(app.getPath('userData'), 'service-settings.json');
const getServiceCredentialsPath = () => join(app.getPath('userData'), 'service-credentials.bin');
const getAgentProcessPath = () => join(__dirname, 'agent-process.js');
const getPackagedResourcesPath = () =>
  (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ??
  join(process.cwd(), 'out');
const getLocalLiveKitRuntimeDirectory = () => join(app.getPath('userData'), 'livekit-runtime');
const getLocalLiveKitExecutablePath = () =>
  getLocalLiveKitServerPath({
    isPackaged: app.isPackaged,
    resourcesPath: getPackagedResourcesPath(),
    projectRoot: process.cwd(),
  });

const globalPushToTalk = new GlobalPushToTalkController({
  addonPath: getGlobalPushToTalkAddonPath({
    isPackaged: app.isPackaged,
    resourcesPath: getPackagedResourcesPath(),
    projectRoot: process.cwd(),
  }),
  onEvent: (event: GlobalPushToTalkEvent) => {
    if (isLiveWindow(assistantWindow)) assistantWindow.webContents.send('voice:global-ptt', event);
  },
});

const emptyServiceCredentialStatus = (error?: string): ServiceCredentialStatus => ({
  encryptionAvailable: false,
  configured: Object.fromEntries(serviceCredentialKeys.map((key) => [key, false])) as Record<
    ServiceCredentialKey,
    boolean
  >,
  ...(error ? { error } : {}),
});

const readStoredServiceCredentials = async (): Promise<StoredServiceCredentials> => {
  if (!safeStorage.isEncryptionAvailable()) return {};
  try {
    const encrypted = await readFile(getServiceCredentialsPath());
    const parsed = serviceCredentialUpdatesSchema.safeParse(
      JSON.parse(safeStorage.decryptString(encrypted)),
    );
    if (!parsed.success) return {};
    const credentials: StoredServiceCredentials = {};
    for (const key of serviceCredentialKeys) {
      const value = parsed.data[key];
      if (value) credentials[key] = value;
    }
    return credentials;
  } catch {
    return {};
  }
};

const readStoredServiceSettings = async (): Promise<DesktopServiceSettings | undefined> => {
  try {
    const parsed = desktopServiceSettingsSchema.safeParse(
      JSON.parse(await readFile(getServiceSettingsPath(), 'utf8')),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const writeStoredServiceSettings = async (settings: DesktopServiceSettings): Promise<void> => {
  await writeFile(getServiceSettingsPath(), JSON.stringify(settings), { mode: 0o600 });
};

const writeStoredServiceCredentials = async (
  credentials: StoredServiceCredentials,
): Promise<void> => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密服务不可用');
  await writeFile(
    getServiceCredentialsPath(),
    safeStorage.encryptString(JSON.stringify(credentials)),
    {
      mode: 0o600,
    },
  );
};

const getServiceCredentialStatus = async (): Promise<ServiceCredentialStatus> => {
  const local = getVisibleLocalServiceCredentials();
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      encryptionAvailable: false,
      configured: Object.fromEntries(
        serviceCredentialKeys.map((key) => [key, Boolean(local[key])]),
      ) as Record<ServiceCredentialKey, boolean>,
      error: '系统加密服务不可用，正在使用本机 .env 配置。',
    };
  }
  const stored = await readStoredServiceCredentials();
  return {
    encryptionAvailable: true,
    configured: Object.fromEntries(
      serviceCredentialKeys.map((key) => [key, Boolean(stored[key] || local[key])]),
    ) as Record<ServiceCredentialKey, boolean>,
  };
};

const getVisibleLocalServiceCredentials = (): VisibleServiceCredentials => {
  reloadLocalEnvironment(localEnvironmentPath);
  const appId = process.env.VOLCENGINE_SPEECH_APP_ID?.trim() ?? '';
  const accessToken = process.env.VOLCENGINE_SPEECH_ACCESS_TOKEN?.trim() ?? '';
  return {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? '',
    sttAppId: appId,
    sttAccessToken: accessToken,
    ttsAppId: appId,
    ttsAccessToken: accessToken,
    searchApiKey: process.env.VOLCENGINE_SEARCH_API_KEY?.trim() ?? '',
  };
};

const getEffectiveServiceEnvironment = async (
  services?: DesktopServiceSettings,
  credentials?: StoredServiceCredentials,
): Promise<NodeJS.ProcessEnv> => {
  reloadLocalEnvironment(localEnvironmentPath);
  const storedSettings = services ?? (await readStoredServiceSettings());
  const storedCredentials = credentials ?? (await readStoredServiceCredentials());
  return applyDesktopServiceSettings(
    process.env,
    getInheritedEnvironment(),
    storedSettings ?? defaultDesktopServiceSettings,
    storedCredentials,
  );
};

const readStoredGuideLocale = async (): Promise<GuideLocale> => {
  try {
    const parsed = supportedLocaleSchema.safeParse(
      JSON.parse(await readFile(getGuideLocalePath(), 'utf8')),
    );
    return parsed.success ? parsed.data : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
};

const saveGuideLocale = async (locale: GuideLocale): Promise<void> => {
  await writeFile(getGuideLocalePath(), JSON.stringify(locale), { mode: 0o600 });
};

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
  const environment = await getEffectiveServiceEnvironment();
  if (app.isPackaged) {
    try {
      const localConnection = await localLiveKitRuntime.ensureStarted({
        executablePath: getLocalLiveKitExecutablePath(),
        runtimeDirectory: getLocalLiveKitRuntimeDirectory(),
      });
      Object.assign(environment, applyLocalLiveKitEnvironment(environment, localConnection));
    } catch (error) {
      return { readiness: localLiveKitFailureReadiness(error) };
    }
  }
  const configuration = checkDesktopConfiguration(environment);
  if (!configuration.ok) return { readiness: configuration.readiness };

  try {
    await agentRuntime.ensureStarted(
      configuration.config,
      getAgentProcessPath(),
      guideLocale,
      environment,
    );
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

type ServiceSettingsSaveResult =
  { ok: true; transitionId: string } | { ok: false; readiness: DesktopReadiness };

const serviceSettingsFailure = (message: string): ServiceSettingsSaveResult => ({
  ok: false,
  readiness: { status: 'error', message, issues: [] },
});

const sendServiceTransitionResult = (result: { ok: boolean; message: string }) => {
  void getDiagnosticsLogger().append('main', { event: 'service_transition_result', ...result });
  if (isLiveWindow(utilityWindow) && !utilityWindow.webContents.isDestroyed()) {
    utilityWindow.webContents.send('settings:service-transition-result', result);
  }
};

const prepareServiceTransition = async (
  request: ServiceSettingsSaveRequest,
): Promise<ServiceSettingsSaveResult> => {
  void getDiagnosticsLogger().append('main', { event: 'service_transition_requested' });
  if (pendingServiceTransition) return serviceSettingsFailure('已有服务配置正在重新连接。');

  const hasCredentialUpdate = serviceCredentialKeys.some(
    (key) => request.credentials[key] !== undefined,
  );
  if (hasCredentialUpdate && !safeStorage.isEncryptionAvailable()) {
    return serviceSettingsFailure('系统加密服务不可用，未保存任何凭据。');
  }

  const credentials = mergeCredentialUpdates(
    await readStoredServiceCredentials(),
    request.credentials,
  );
  const environment = await getEffectiveServiceEnvironment(request.services, credentials);
  if (app.isPackaged) {
    try {
      const localConnection = await localLiveKitRuntime.ensureStarted({
        executablePath: getLocalLiveKitExecutablePath(),
        runtimeDirectory: getLocalLiveKitRuntimeDirectory(),
      });
      Object.assign(environment, applyLocalLiveKitEnvironment(environment, localConnection));
    } catch (error) {
      return { ok: false, readiness: localLiveKitFailureReadiness(error) };
    }
  }

  const configuration = checkDesktopConfiguration(environment);
  if (!configuration.ok) return { ok: false, readiness: configuration.readiness };

  const transitionId = randomUUID();
  const candidateConfig: AppConfig = {
    ...configuration.config,
    livekit: {
      ...configuration.config.livekit,
      // The candidate must not compete with the current Worker for its Room dispatch.
      agentName: `${configuration.config.livekit.agentName}-candidate-${transitionId.slice(0, 8)}`,
    },
  };
  const candidateEnvironment = {
    ...environment,
    LIVEKIT_AGENT_NAME: candidateConfig.livekit.agentName,
  };
  const candidateRuntime = createAgentRuntime(8099);
  try {
    await candidateRuntime.ensureStarted(
      candidateConfig,
      getAgentProcessPath(),
      guideLocale,
      candidateEnvironment,
    );
    const ready = await candidateRuntime.waitUntilReady();
    if (!ready) {
      await candidateRuntime.stop();
      return { ok: false, readiness: candidateRuntime.getReadiness() };
    }
  } catch (error) {
    await candidateRuntime.stop();
    return { ok: false, readiness: workerFailureReadiness(error) };
  }

  pendingServiceTransition = {
    id: transitionId,
    runtime: candidateRuntime,
    config: candidateConfig,
    services: request.services,
    credentials,
    persistCredentials: hasCredentialUpdate,
  };
  void getDiagnosticsLogger().append('main', { event: 'service_transition_candidate_ready' });
  if (isLiveWindow(assistantWindow) && !assistantWindow.webContents.isDestroyed()) {
    assistantWindow.webContents.send('settings:service-reconnect-needed', transitionId);
  }
  return { ok: true, transitionId };
};

const completeServiceTransition = async (transitionId: string) => {
  const transition = pendingServiceTransition;
  if (!transition || transition.id !== transitionId) {
    return { ok: false, message: '服务配置切换已失效，请重新保存。' };
  }
  try {
    await writeStoredServiceSettings(transition.services);
    if (transition.persistCredentials) await writeStoredServiceCredentials(transition.credentials);
  } catch {
    await transition.runtime.stop();
    pendingServiceTransition = null;
    const result = { ok: false, message: '无法安全保存服务配置，已恢复旧会话。' };
    sendServiceTransitionResult(result);
    return result;
  }

  const previousRuntime = agentRuntime;
  agentRuntime = transition.runtime;
  pendingServiceTransition = null;
  await previousRuntime.stop();
  const result = { ok: true, message: '服务配置已生效，已连接新的导游会话。' };
  sendServiceTransitionResult(result);
  return result;
};

const rollbackServiceTransition = async (transitionId: string) => {
  const transition = pendingServiceTransition;
  if (!transition || transition.id !== transitionId) return;
  pendingServiceTransition = null;
  await transition.runtime.stop();
  sendServiceTransitionResult({ ok: false, message: '新服务会话未能连接，已保留原有会话。' });
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

const isSafeWebUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
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

const openUtilityWindow = async (kind: UtilityKind): Promise<boolean> => {
  if (!isLiveWindow(assistantWindow)) return false;
  const parentWindow = assistantWindow;
  if (assistantMenuOpen) setAssistantMenuOpen(false);

  if (isLiveWindow(utilityWindow)) {
    if (utilityWindow.webContents.getURL().endsWith(`#${kind}`)) {
      utilityWindow.show();
      utilityWindow.focus();
      return true;
    }
    utilityWindow.close();
  }

  const size = kind === 'settings' ? settingsSize : quitDialogSize;
  const minimumSize = kind === 'settings' ? { width: 460, height: 440 } : size;
  const window = new BrowserWindow({
    parent: parentWindow,
    width: size.width,
    height: size.height,
    minWidth: minimumSize.width,
    minHeight: minimumSize.height,
    frame: false,
    transparent: true,
    resizable: kind === 'settings',
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
  try {
    await loadRenderer(window, kind);
    return true;
  } catch (error) {
    console.error(`Failed to open ${kind} utility window`, error);
    if (!window.isDestroyed()) window.destroy();
    utilityWindow = releaseWindowReference(utilityWindow, window);
    return false;
  }
};

const setSourcePosition = (x: number, y: number) => {
  if (!isLiveWindow(sourceWindow)) return;
  const window = sourceWindow;
  const bounds = window.getBounds();
  if (bounds.x === x && bounds.y === y) return;
  isPositioningSource = true;
  window.setPosition(x, y);
  setTimeout(() => {
    isPositioningSource = false;
  }, 0);
};

const setSourceViewBounds = () => {
  if (!isLiveWindow(sourceWindow) || !sourceView || sourceView.webContents.isDestroyed()) return;
  sourceView.setBounds(getSourceViewBounds(sourceWindow.getContentSize()));
};

const resetSourcePageZoom = () => {
  sourcePageZoomPercent = resetSourcePageZoomPercent();
};

const applySourcePageZoom = () => {
  if (!sourceView || sourceView.webContents.isDestroyed()) return;
  sourceView.webContents.setZoomFactor(sourcePageZoomFactorFromPercent(sourcePageZoomPercent));
};

const setSourcePageZoomPercent = (percent: number) => {
  sourcePageZoomPercent = clampSourcePageZoomPercent(percent);
  applySourcePageZoom();
  if (!sourceWindowState || sourceWindowState.mode === 'preview') return sourcePageZoomPercent;
  publishSourceWindowState({
    ...sourceWindowState,
    pageZoomPercent: sourcePageZoomPercent,
  });
  return sourcePageZoomPercent;
};

const clearSourceLoadTimer = () => {
  if (!sourceLoadTimer) return;
  clearTimeout(sourceLoadTimer);
  sourceLoadTimer = null;
};

const destroySourceView = () => {
  clearSourceLoadTimer();
  sourceViewLoad = null;
  sourceViewPrewarm = null;
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
    pageZoomPercent: sourcePageZoomPercent,
    error,
    message,
    ...(statusCode ? { statusCode } : {}),
  });
  void ensurePrewarmedSourceView();
};

const startSourceLoadTimer = (view: WebContentsView, currentUrl: string) => {
  clearSourceLoadTimer();
  sourceLoadTimer = setTimeout(() => {
    failSourceLoad(
      view,
      currentUrl,
      'timeout',
      '网页在 15 秒内没有显示首屏，请重试或改用系统浏览器打开。',
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
  if (
    !isLiveWindow(assistantWindow) ||
    !isLiveWindow(sourceWindow) ||
    !shouldFollowAssistantWindow(sourceWindowFollowMode)
  )
    return;
  const assistantBounds = assistantWindow.getBounds();
  const sourceBounds = sourceWindow.getBounds();
  const display = screen.getDisplayMatching(assistantBounds);
  const placement = placeCompanionWindow(
    assistantBounds,
    { width: sourceBounds.width, height: sourceBounds.height },
    display.workArea,
  );
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

type SourceNavigation = {
  currentUrl: string;
  responseStatusCode?: number;
  source: GuideSource;
  visible: boolean;
};

type SourceLoadOptions = {
  url?: string;
};

const createSourceView = () => {
  let navigation: SourceNavigation | null = null;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:source-preview',
      sandbox: true,
    },
  });
  const showFirstVisibleDocument = () => {
    if (!navigation || navigation.visible || !sourcePreview || sourceView !== view) return;
    if (navigation.responseStatusCode && navigation.responseStatusCode >= 400) {
      failSourceLoad(
        view,
        navigation.currentUrl,
        'http',
        `网站返回了 HTTP ${navigation.responseStatusCode}，页面无法在应用内显示。`,
        navigation.responseStatusCode,
      );
      return;
    }
    navigation.visible = true;
    clearSourceLoadTimer();
    attachSourceView(view);
    applySourcePageZoom();
    publishSourceWindowState({
      mode: 'ready',
      preview: sourcePreview,
      source: navigation.source,
      currentUrl: navigation.currentUrl,
      pageZoomPercent: sourcePageZoomPercent,
    });
  };

  sourceView = view;
  sourceViewAttached = false;
  view.webContents.setWindowOpenHandler((details) => {
    if (isSafeWebUrl(details.url)) void shell.openExternal(details.url);
    return { action: 'deny' };
  });
  view.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  view.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (
      navigation &&
      details.webContentsId === view.webContents.id &&
      details.resourceType === 'mainFrame'
    ) {
      navigation.responseStatusCode = details.statusCode;
      navigation.currentUrl = details.url;
    }
    callback({});
  });
  view.webContents.on('will-navigate', (event, targetUrl) => {
    if (!navigation || isSafeWebUrl(targetUrl)) return;
    event.preventDefault();
    queueMicrotask(() =>
      failSourceLoad(
        view,
        navigation?.currentUrl ?? targetUrl,
        'blocked',
        '该页面尝试跳转到不受支持的地址。',
      ),
    );
  });
  view.webContents.on('will-redirect', (event, targetUrl) => {
    if (!navigation || isSafeWebUrl(targetUrl)) return;
    event.preventDefault();
    queueMicrotask(() =>
      failSourceLoad(
        view,
        navigation?.currentUrl ?? targetUrl,
        'blocked',
        '该页面尝试跳转到不受支持的地址。',
      ),
    );
  });
  view.webContents.on('did-start-navigation', (_event, targetUrl, isInPlace, isMainFrame) => {
    if (!navigation || !isMainFrame || isInPlace || !isSafeWebUrl(targetUrl) || sourceView !== view)
      return;
    navigation.currentUrl = targetUrl;
    delete navigation.responseStatusCode;
    navigation.visible = false;
    detachSourceView(view);
    publishSourceWindowState({
      mode: 'loading',
      preview: sourcePreview!,
      source: navigation.source,
      currentUrl: targetUrl,
      pageZoomPercent: sourcePageZoomPercent,
    });
    startSourceLoadTimer(view, targetUrl);
  });
  view.webContents.on('dom-ready', showFirstVisibleDocument);
  view.webContents.on('did-finish-load', showFirstVisibleDocument);
  view.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!navigation || !isMainFrame || sourceView !== view) return;
      failSourceLoad(
        view,
        isSafeWebUrl(validatedUrl) ? validatedUrl : navigation.currentUrl,
        navigation.responseStatusCode && navigation.responseStatusCode >= 400 ? 'http' : 'network',
        navigation.responseStatusCode && navigation.responseStatusCode >= 400
          ? `网站返回了 HTTP ${navigation.responseStatusCode}，页面无法在应用内显示。`
          : `网络加载失败（${errorCode}：${errorDescription}）。`,
        navigation.responseStatusCode && navigation.responseStatusCode >= 400
          ? navigation.responseStatusCode
          : undefined,
      );
    },
  );
  view.webContents.on('render-process-gone', () => {
    if (!navigation) {
      destroySourceView();
      return;
    }
    failSourceLoad(view, navigation.currentUrl, 'renderer', '网页渲染进程意外退出，请重试。');
  });

  sourceViewLoad = (source, initialUrl) => {
    navigation = { currentUrl: initialUrl, source, visible: false };
    detachSourceView(view);
    publishSourceWindowState({
      mode: 'loading',
      preview: sourcePreview!,
      source,
      currentUrl: initialUrl,
      pageZoomPercent: sourcePageZoomPercent,
    });
    startSourceLoadTimer(view, initialUrl);
    void view.webContents.loadURL(initialUrl).catch((error: unknown) => {
      if (sourceView !== view || !navigation || navigation.currentUrl !== initialUrl) return;
      failSourceLoad(
        view,
        initialUrl,
        'network',
        error instanceof Error ? `网络加载失败：${error.message}` : '网络加载失败。',
      );
    });
  };

  return view;
};

const ensurePrewarmedSourceView = async () => {
  if (sourceView && !sourceView.webContents.isDestroyed()) return sourceView;
  if (sourceViewPrewarm) return sourceViewPrewarm;

  const view = createSourceView();
  setSourceViewBounds();
  applySourcePageZoom();
  // A newly created WebContentsView already owns an about:blank renderer.
  // Do not await a second navigation to the same URL: Electron may coalesce it
  // without completing the load promise, which would block source selection.
  const prewarm = Promise.resolve(view);
  sourceViewPrewarm = prewarm;
  queueMicrotask(() => {
    if (sourceViewPrewarm === prewarm) sourceViewPrewarm = null;
  });
  return prewarm;
};

const showRemoteSource = async (source: GuideSource, options: SourceLoadOptions = {}) => {
  const initialUrl = options.url ?? source.url;
  if (!isLiveWindow(sourceWindow) || !sourcePreview || !isSafeWebUrl(initialUrl)) return false;
  selectedSource = source;
  resetSourcePageZoom();
  const view = await ensurePrewarmedSourceView();
  if (!view || sourceView !== view || view.webContents.isDestroyed()) return false;

  if (!sourceViewLoad) return false;
  applySourcePageZoom();
  sourceViewLoad(source, initialUrl);
  return true;
};

const createAssistantWindow = async () => {
  const savedBounds = storedWindowState.assistant;
  assistantCollapsed = storedWindowState.collapsed ?? false;
  assistantDockSide = storedWindowState.dockSide ?? 'right';
  expandedAssistantBounds = storedWindowState.expandedAssistant ?? null;
  const initialSize = assistantCollapsed ? collapsedSize : assistantSize;
  const initialDisplay = savedBounds
    ? screen.getDisplayMatching(savedBounds)
    : screen.getPrimaryDisplay();
  const restoredSize = assistantCollapsed
    ? collapsedSize
    : getRestorableSize(savedBounds, initialSize, initialDisplay.workArea);
  const window = new BrowserWindow({
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    width: restoredSize.width,
    height: restoredSize.height,
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
  const parentDisplay = screen.getDisplayMatching(parentWindow.getBounds());
  const restoredSourceSize = getRestorableSize(savedSourceSize, sourceSize, parentDisplay.workArea);
  // Pre-calculate the companion position so the window never appears at the
  // primary-display default location before being repositioned.
  const initialPlacement = placeCompanionWindow(
    parentWindow.getBounds(),
    restoredSourceSize,
    parentDisplay.workArea,
  );
  const window = new BrowserWindow({
    parent: parentWindow,
    x: initialPlacement.x,
    y: initialPlacement.y,
    width: restoredSourceSize.width,
    height: restoredSourceSize.height,
    minWidth: 280,
    minHeight: 240,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  sourceWindow = window;
  sourceWindowFollowMode = startSourceWindowSession();
  window.setAlwaysOnTop(true, 'floating');
  attachDevelopmentDiagnostics(window);
  window.on('resize', () => {
    if (sourceWindow !== window || !isLiveWindow(window)) return;
    setSourceViewBounds();
    schedulePersistWindowState();
  });
  window.on('moved', () => {
    if (sourceWindow !== window || !isLiveWindow(window)) return;
    sourceWindowFollowMode = updateSourceWindowFollowMode(
      sourceWindowFollowMode,
      isPositioningSource,
    );
  });
  const releaseSourceWindow = () => {
    if (sourceWindow !== window) return;
    destroySourceView();
    sourceWindow = releaseWindowReference(sourceWindow, window);
    sourcePreview = null;
    selectedSource = null;
    sourceWindowState = null;
    resetSourcePageZoom();
    sourceWindowFollowMode = startSourceWindowSession();
  };
  window.on('close', releaseSourceWindow);
  window.on('closed', releaseSourceWindow);
  await loadRenderer(window, 'source');
  void ensurePrewarmedSourceView();
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
  const collapsedBounds = window.getBounds();
  const restoredSize = getRestorableSize(
    expandedAssistantBounds,
    assistantSize,
    currentDisplay.workArea,
  );
  const restored = getExpandedBounds(
    currentDisplay.workArea,
    assistantDockSide,
    collapsedBounds.y,
    restoredSize,
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

const diagnosticConfigurationSummary = async () => {
  const services = await readStoredServiceSettings();
  const credentialStatus = await getServiceCredentialStatus();
  return {
    schemaVersion: 1,
    locale: guideLocale,
    credentialsConfigured: credentialStatus.configured,
    encryptionAvailable: credentialStatus.encryptionAvailable,
    services: services ?? defaultDesktopServiceSettings,
  };
};

ipcMain.handle('diagnostics:export', async (event): Promise<DiagnosticExportResult> => {
  if (!isUtilitySender(event.sender)) {
    return { ok: false, message: '无权导出诊断包。' };
  }
  const saveDialogOptions = {
    title: '导出诊断包',
    defaultPath: `msfs-ai-guide-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    showOverwriteConfirmation: true,
  };
  const result = isLiveWindow(utilityWindow)
    ? await dialog.showSaveDialog(utilityWindow, saveDialogOptions)
    : await dialog.showSaveDialog(saveDialogOptions);
  if (result.canceled || !result.filePath) {
    return { ok: false, cancelled: true, message: '已取消导出诊断包。' };
  }

  try {
    const logger = getDiagnosticsLogger();
    const snapshot = await logger.snapshot();
    const readiness = agentRuntime.getReadiness();
    const manifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      applicationVersion: app.getVersion(),
      runtime: {
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      timeRange: snapshot.timeRange,
      redactionCount: snapshot.redactionCount,
    };
    await writeDiagnosticArchive({
      targetPath: result.filePath,
      snapshot,
      manifest,
      readiness,
      configurationSummary: await diagnosticConfigurationSummary(),
    });
    void logger.append('main', { event: 'diagnostic_exported' });
    return { ok: true, message: '诊断包已导出。' };
  } catch (error) {
    void getDiagnosticsLogger().append('main', {
      event: 'diagnostic_export_failed',
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { ok: false, message: '无法写入诊断包，请确认目标位置可用且磁盘空间充足。' };
  }
});

ipcMain.on('diagnostics:record-conversation', (event, value: unknown) => {
  if (!isAssistantSender(event.sender)) return;
  const parsed = diagnosticConversationRecordSchema.safeParse(value);
  if (parsed.success) void getDiagnosticsLogger().append('conversation', parsed.data);
});

ipcMain.on('diagnostics:record-tool-event', (event, value: unknown) => {
  if (!isAssistantSender(event.sender)) return;
  const parsed = diagnosticToolEventSchema.safeParse(value);
  if (parsed.success) void getDiagnosticsLogger().append('tool-events', parsed.data);
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
  if (pendingServiceTransition) {
    return {
      ok: true,
      credentials: await createDesktopSessionCredentials(pendingServiceTransition.config),
    };
  }
  const result = await startConfiguredAgent(true);
  if (!('config' in result) || result.readiness.status !== 'ready') {
    return { ok: false, readiness: result.readiness };
  }
  return { ok: true, credentials: await createDesktopSessionCredentials(result.config) };
});

ipcMain.handle('settings:open', async (event) => {
  if (!isAssistantSender(event.sender)) return false;
  return openUtilityWindow('settings');
});

ipcMain.handle('about:get-info', (event): AboutInfo | null => {
  if (!isUtilitySender(event.sender)) return null;
  return getAboutInfo();
});

ipcMain.handle('about:open-link', async (event, value: unknown): Promise<boolean> => {
  if (!isUtilitySender(event.sender)) return false;
  return openAboutLink(value);
});

ipcMain.handle('voice:get-global-ptt-status', (event): GlobalPushToTalkStatus => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) {
    return { available: false, active: false, message: '无权读取全局按住说话状态。' };
  }
  return globalPushToTalk.getStatus();
});

ipcMain.handle('voice:configure-global-ptt', (event, value: unknown): GlobalPushToTalkStatus => {
  if (!isAssistantSender(event.sender)) {
    return { available: false, active: false, message: '无权配置全局按住说话。' };
  }
  const parsed = globalPushToTalkConfigurationSchema.safeParse(value);
  if (!parsed.success) {
    return { available: false, active: false, message: '全局按住说话键无效。' };
  }
  return globalPushToTalk.configure(parsed.data);
});

ipcMain.handle('settings:save-locale', async (event, value: unknown) => {
  if (!isUtilitySender(event.sender)) {
    return {
      ok: false,
      readiness: { status: 'error', message: '无权更新语言设置。', issues: [] },
    } satisfies { ok: boolean; readiness: DesktopReadiness };
  }
  const parsed = supportedLocaleSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      readiness: { status: 'error', message: '语言设置无效。', issues: [] },
    } satisfies { ok: boolean; readiness: DesktopReadiness };
  }
  if (parsed.data === guideLocale) {
    return { ok: true, readiness: agentRuntime.getReadiness() };
  }

  const previousLocale = guideLocale;
  guideLocale = parsed.data;
  const result = await startConfiguredAgent(true);
  if ('config' in result && result.readiness.status === 'ready') {
    try {
      await saveGuideLocale(guideLocale);
      if (isLiveWindow(assistantWindow)) {
        assistantWindow.webContents.send('settings:locale-saved', guideLocale);
      }
      if (isLiveWindow(sourceWindow)) {
        sourceWindow.webContents.send('settings:locale-saved', guideLocale);
      }
      return { ok: true, readiness: result.readiness };
    } catch {
      // Fall through to restore the last working locale and worker.
    }
  }

  guideLocale = previousLocale;
  const rollback = await startConfiguredAgent(true);
  return {
    ok: false,
    readiness: 'readiness' in rollback ? rollback.readiness : result.readiness,
  };
});

ipcMain.handle(
  'settings:get-credential-status',
  async (event): Promise<ServiceCredentialStatus> => {
    if (!isUtilitySender(event.sender))
      return emptyServiceCredentialStatus('无权访问服务凭据状态。');
    return getServiceCredentialStatus();
  },
);

ipcMain.handle('settings:get-visible-local-credentials', (event): VisibleServiceCredentials => {
  if (!isUtilitySender(event.sender)) {
    return {
      deepseekApiKey: '',
      sttAppId: '',
      sttAccessToken: '',
      ttsAppId: '',
      ttsAccessToken: '',
      searchApiKey: '',
    };
  }
  return getVisibleLocalServiceCredentials();
});

ipcMain.handle('settings:get-service-settings', async (event): Promise<DesktopServiceSettings> => {
  if (!isUtilitySender(event.sender)) return defaultDesktopServiceSettings;
  const environment = await getEffectiveServiceEnvironment();
  const configuration = checkDesktopConfiguration(environment);
  return configuration.ok
    ? serviceSettingsFromConfig(configuration.config)
    : ((await readStoredServiceSettings()) ?? defaultDesktopServiceSettings);
});

ipcMain.handle(
  'settings:save-credentials',
  async (event, value: unknown): Promise<ServiceCredentialStatus> => {
    if (!isUtilitySender(event.sender)) return emptyServiceCredentialStatus('无权保存服务凭据。');
    const parsed = serviceCredentialUpdatesSchema.safeParse(value);
    if (!parsed.success) return emptyServiceCredentialStatus('凭据格式无效，未保存任何内容。');
    try {
      return emptyServiceCredentialStatus('服务凭据必须随“保存并重新连接”原子提交。');
    } catch {
      return emptyServiceCredentialStatus('无法安全保存凭据。');
    }
  },
);

ipcMain.handle('settings:save-service-settings', async (event, value: unknown) => {
  if (!isUtilitySender(event.sender)) return serviceSettingsFailure('无权保存服务配置。');
  const parsed = serviceSettingsSaveRequestSchema.safeParse(value);
  if (!parsed.success) return serviceSettingsFailure('服务配置格式无效，未保存任何内容。');
  return prepareServiceTransition(parsed.data);
});

ipcMain.handle(
  'settings:test-service',
  async (event, value: unknown): Promise<ServiceCheckResult> => {
    const parsed = serviceCheckRequestSchema.safeParse(value);
    if (!isUtilitySender(event.sender) || !parsed.success) {
      return {
        target: parsed.success ? parsed.data.target : 'llm',
        status: 'unavailable',
        message: '服务检测请求无效。',
      };
    }
    const credentials = mergeCredentialUpdates(
      await readStoredServiceCredentials(),
      parsed.data.credentials,
    );
    const environment = await getEffectiveServiceEnvironment(parsed.data.services, credentials);
    return serviceAvailabilityChecker.check(parsed.data.target, environment);
  },
);

ipcMain.handle('settings:complete-service-reconnect', async (event, transitionId: unknown) => {
  if (!isAssistantSender(event.sender) || typeof transitionId !== 'string') {
    return { ok: false, message: '无权完成服务重连。' };
  }
  return completeServiceTransition(transitionId);
});

ipcMain.handle('settings:rollback-service-reconnect', async (event, transitionId: unknown) => {
  if (!isAssistantSender(event.sender) || typeof transitionId !== 'string') return;
  await rollbackServiceTransition(transitionId);
});

ipcMain.handle('app:open-quit-dialog', async (event) => {
  if (!isAssistantSender(event.sender)) return false;
  return openUtilityWindow('quit');
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
  if (!isLiveWindow(assistantWindow) || !isAssistantSender(event.sender) || !isSafeWebUrl(url)) {
    return false;
  }
  const hostname = new URL(url).hostname;
  const preview = guideSourcesMessageSchema.parse({
    type: 'guide.sources',
    sources: [{ rank: 1, title: hostname, siteName: hostname, url, openMode: 'in_app' }],
  });
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
  sourcePreview = parsed.data;
  selectedSource = null;
  destroySourceView();
  resetSourcePageZoom();
  publishSourceWindowState({ mode: 'preview', preview: parsed.data });
  if (!isLiveWindow(sourceWindow)) await createSourceWindow();
  if (!isLiveWindow(sourceWindow)) return false;
  positionSourceNextToAssistant();
  sourceWindow.show();
  sourceWindow.focus();
  publishSourceWindowState({ mode: 'preview', preview: parsed.data });
  void ensurePrewarmedSourceView();
  return true;
});

ipcMain.handle('source:get-state', (event) =>
  isSourceSender(event.sender) ? sourceWindowState : null,
);

ipcMain.handle('source:select', async (event, url: string) => {
  if (!isSourceSender(event.sender) || !sourcePreview) return false;
  const source = sourcePreview.sources.find((candidate) => candidate.url === url);
  if (!source) return false;
  return showRemoteSource(source);
});

ipcMain.handle('source:back', (event) => {
  if (!isSourceSender(event.sender) || !sourcePreview) return false;
  destroySourceView();
  selectedSource = null;
  resetSourcePageZoom();
  publishSourceWindowState({ mode: 'preview', preview: sourcePreview });
  void ensurePrewarmedSourceView();
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

ipcMain.handle('source:set-page-zoom', (event, action: 'in' | 'out' | 'reset') => {
  if (!isSourceSender(event.sender) || !sourceWindowState || sourceWindowState.mode === 'preview') {
    return null;
  }
  if (action === 'reset') {
    return setSourcePageZoomPercent(resetSourcePageZoomPercent());
  }
  if (action !== 'in' && action !== 'out') return null;
  const direction: SourcePageZoomDirection = action;
  return setSourcePageZoomPercent(stepSourcePageZoomPercent(sourcePageZoomPercent, direction));
});

ipcMain.handle('source:open-current-external', async (event) => {
  if (!isSourceSender(event.sender) || !selectedSource) return false;
  const currentUrl =
    sourceWindowState && sourceWindowState.mode !== 'preview'
      ? sourceWindowState.currentUrl
      : selectedSource.url;
  if (!isSafeWebUrl(currentUrl)) return false;
  await shell.openExternal(currentUrl);
  return true;
});

ipcMain.handle('source:close', (event) => {
  if (isSourceSender(event.sender) && isLiveWindow(sourceWindow)) sourceWindow.close();
});

ipcMain.handle('external:open', (event, url: string) => {
  const trustedSender = isAssistantSender(event.sender) || isSourceSender(event.sender);
  return trustedSender && isSafeWebUrl(url) ? shell.openExternal(url) : undefined;
});

app.whenReady().then(async () => {
  storedWindowState = readStoredWindowState(getWindowStatePath());
  guideLocale = await readStoredGuideLocale();
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
  globalPushToTalk.dispose();
  persistWindowState();
  const pendingRuntime = pendingServiceTransition?.runtime;
  pendingServiceTransition = null;
  void agentRuntime
    .stop()
    .finally(() => pendingRuntime?.stop())
    .finally(() => localLiveKitRuntime.stop())
    .finally(() => {
      shutdownComplete = true;
      app.quit();
    });
});
app.on('activate', () => {
  if (!isLiveWindow(assistantWindow)) void createAssistantWindow();
});
