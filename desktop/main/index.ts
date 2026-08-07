import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  screen,
  shell,
  utilityProcess,
  WebContentsView,
} from 'electron';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLlmConfig, loadMsfsConfig, type AppConfig } from '../../src/config/schema.js';
import { applyBundledGeoEnvironment } from '../../src/config/bundled-geo.js';
import { guideSourcesMessageSchema, type GuideSource } from '../../shared/guide-events.js';
import {
  companionPreviewSources,
  sourceMoreMenuActionSchema,
  sourceMoreMenuStateSchema,
  type CompanionPreview,
  type SourceMoreMenuAction,
  type SourceMoreMenuState,
  type SourceWindowNavigation,
  type SourceWindowState,
} from '../../shared/source-preview.js';
import {
  exploreRequestSchema,
  exploreSuggestionSchema,
  type ExploreResult,
} from '../../shared/explore-contracts.js';
import { MsfsCliClient } from '../../src/msfs/cli-client.js';
import { MsfsGuideService } from '../../src/msfs/guide-service.js';
import { MsfsExploreContextProvider } from '../../src/msfs/explore-context.js';
import { resolveMsfsCliPath } from '../../src/msfs/path.js';
import { statusDataSchema, systemStateDataSchema } from '../../src/msfs/schemas.js';
import { ExploreService } from '../../src/explore/service.js';
import { EncyclopediaService } from '../../src/explore/encyclopedia/service.js';
import { WikipediaSearchPageProvider } from '../../src/explore/encyclopedia/wikipedia-search-page.js';
import { BaiduBaikeSearchPageProvider } from '../../src/explore/encyclopedia/baidu-baike.js';
import { VideoService } from '../../src/explore/video/service.js';
import { BilibiliSearchPageProvider } from '../../src/explore/video/bilibili.js';
import { YouTubeSearchPageProvider } from '../../src/explore/video/youtube.js';
import type { VideoProvider } from '../../src/explore/video/provider.js';
import { DeepSeekExplorePlanner } from '../../src/providers/llm/deepseek-explore.js';
import type {
  DesktopReadiness,
  DesktopSessionResult,
  StoredWindowState,
} from '../../shared/desktop-contracts.js';
import {
  defaultSourceReadingPreference,
  sourceReadingPreferenceForUrl,
  updateSourceReadingPreference,
  type SourceReadingMode,
  type SourceReadingPreferences,
} from '../../shared/source-reading-preferences.js';
import {
  diagnosticConversationRecordSchema,
  diagnosticToolEventSchema,
  type DiagnosticExportResult,
} from '../../shared/desktop-diagnostics.js';
import {
  alignTtsSpeakerToLocale,
  defaultDesktopServiceSettings,
  defaultDesktopToolSettings,
  desktopServiceSettingsSchema,
  desktopToolSettingsSchema,
  desktopSettingsSaveRequestSchema,
  serviceCredentialKeys,
  serviceCredentialUpdatesSchema,
  serviceCheckRequestSchema,
  supportedLocaleSchema,
  type DesktopSettingsSaveRequest,
  type DesktopServiceSettings,
  type DesktopToolSettings,
  type ServiceCredentialKey,
  type ServiceCredentialStatus,
  type ServiceCheckResult,
  type StoredServiceCredentials,
  type DesktopTtsVoiceSample,
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
import { stopMsfsDaemon } from './msfs-daemon.js';
import {
  ensureLocalEnvironmentFile,
  getInheritedEnvironment,
  reloadLocalEnvironment,
} from './environment.js';
import {
  LocalLiveKitRuntime,
  applyLocalLiveKitEnvironment,
  getLocalLiveKitServerPath,
  shouldAutoStartLocalLiveKit,
} from './local-livekit-runtime.js';
import { checkDesktopConfiguration, localLiveKitFailureReadiness } from './readiness.js';
import { createDesktopSessionCredentials } from './session-token.js';
import { getSourceViewBounds, SOURCE_TITLE_BAR_HEIGHT } from './source-view-bounds.js';
import { getLandscapeSourceWindowBounds } from './source-window-fullscreen.js';
import {
  SOURCE_PAGE_ZOOM_DEFAULT_PERCENT,
  canZoomSourcePageIn,
  canZoomSourcePageOut,
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
  applyDesktopToolSettings,
  mergeCredentialUpdates,
  serviceSettingsFromConfig,
} from './service-settings.js';
import { ServiceAvailabilityChecker } from './service-checks.js';
import { getGlobalPushToTalkAddonPath, GlobalPushToTalkController } from './global-push-to-talk.js';
import { DiagnosticLogger, writeDiagnosticArchive } from './diagnostics.js';
import { withSourceAcceptLanguage } from './source-locale.js';
import { ExploreController } from './explore-controller.js';
import {
  defaultMsfsUserConfigCandidates,
  installMsfsCommunityPackage,
  MsfsConfigurationChecker,
} from './msfs-diagnostics.js';
import { MsfsConnectionMonitor } from './msfs-connection-monitor.js';
import {
  msfsConfigurationDiagnosticSchema,
  msfsConnectionStatusSchema,
  type MsfsConfigurationDiagnostic,
  type MsfsConnectionStatus,
} from '../../shared/msfs-desktop.js';

const ignoreProcessOutputErrors = (stream: NodeJS.WriteStream) => {
  stream.on('error', () => undefined);
};

ignoreProcessOutputErrors(process.stdout);
ignoreProcessOutputErrors(process.stderr);

const mainFilename = fileURLToPath(import.meta.url);
const mainDir = dirname(mainFilename);

const assistantSize = { width: 320, height: 360 };
const collapsedSize = { width: 64, height: 72 };
const collapsedMenuSize = { width: 64, height: 174 };
const sourceSize = { width: 440, height: 600 };
const sourceMoreMenuSize = { width: 188, height: 234 };
const settingsSize = { width: 620, height: 640 };
const quitDialogSize = { width: 328, height: 224 };
const sourceLoadTimeoutMs = 15_000;
const sourceSessionPartition = 'persist:source-preview';
const sourceMobileUserAgent =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36';

type MenuDirection = 'up' | 'down';
type UtilityKind = 'settings' | 'quit';
type GuideLocale = 'en-US' | 'zh-CN';
type VisibleServiceCredentials = Record<ServiceCredentialKey, string>;

let assistantWindow: BrowserWindow | null = null;
let sourceWindow: BrowserWindow | null = null;
let sourceMoreMenuWindow: BrowserWindow | null = null;
let sourceMoreMenuPrewarm: Promise<BrowserWindow | null> | null = null;
let sourceView: WebContentsView | null = null;
let sourceViewAttached = false;
let sourceViewLoad: ((source: GuideSource, initialUrl: string) => void) | null = null;
let sourcePreview: CompanionPreview | null = null;
let selectedSource: GuideSource | null = null;
let sourceWindowState: SourceWindowState | null = null;
let sourceLoadTimer: NodeJS.Timeout | null = null;
let sourceViewPrewarm: Promise<WebContentsView | null> | null = null;
let sourceMoreMenuBlurTimer: NodeJS.Timeout | null = null;
let sourcePageZoomPercent = SOURCE_PAGE_ZOOM_DEFAULT_PERCENT;
let sourceReadingMode: SourceReadingMode = defaultSourceReadingPreference.mode;
let sourceReadingPreferences: SourceReadingPreferences = {};
const defaultSourceNavigationState: SourceWindowNavigation = {
  pageTitle: '',
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  isVideoFullscreen: false,
};
let sourceNavigationState: SourceWindowNavigation = { ...defaultSourceNavigationState };
let isSourceVideoFullscreen = false;
let sourceVideoFullscreenRestoreBounds: Electron.Rectangle | null = null;
let sourceWindowNormalBounds: Electron.Rectangle | null = null;
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
const agentRuntime = createAgentRuntime();
const localLiveKitRuntime = new LocalLiveKitRuntime();
const serviceAvailabilityChecker = new ServiceAvailabilityChecker();
let guideLocale: GuideLocale = 'zh-CN';
let exploreController: ExploreController | null = null;
let msfsToolSettings: DesktopToolSettings = { ...defaultDesktopToolSettings };
let msfsConnectionMonitor: MsfsConnectionMonitor | null = null;
let sharedMsfsClient: MsfsCliClient | null = null;
let sharedMsfsClientPromise: Promise<MsfsCliClient> | null = null;
let latestMsfsConnectionStatus: MsfsConnectionStatus = {
  visible: true,
  connected: false,
  message: 'MSFS 游戏未连接。',
  timestamp: new Date().toISOString(),
};

const aboutLinks: readonly AboutLink[] = [
  {
    id: 'community',
    label: '加入 QQ 群',
    description: '群号 587441734',
    labelEn: 'Join QQ Group',
    descriptionEn: 'QQ Group 587441734',
    url: 'https://qm.qq.com/q/akr8v7IOP0',
    hostname: 'qm.qq.com',
  },
  {
    id: 'tutorial',
    label: '使用教程',
    description: '查看应用配置与使用说明',
    labelEn: 'User Guide',
    descriptionEn: 'Application setup and usage instructions',
    url: 'https://my.feishu.cn/wiki/Q3DuwRSi3iYA72k79necSfkynWc',
    hostname: 'my.feishu.cn',
  },
];

const getAboutInfo = (): AboutInfo =>
  aboutInfoSchema.parse({
    schemaVersion: 1,
    productName: '晓晓飞行导游',
    version: '1.0',
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
const getToolSettingsPath = () => join(app.getPath('userData'), 'guide-tool-settings.json');
const getServiceCredentialsPath = () => join(app.getPath('userData'), 'service-credentials.bin');
const getAgentProcessPath = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'agent-process.js')
    : join(mainDir, 'agent-process.js');
const getRuntimeSmokeProcessPath = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'runtime-smoke-worker.js')
    : join(mainDir, 'runtime-smoke-worker.js');
const getPackagedResourcesPath = () =>
  app.isPackaged
    ? ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ??
      join(process.cwd(), 'resources'))
    : join(process.cwd(), 'resources');
const getDevelopmentMsfsCliPath = () =>
  app.isPackaged ? undefined : join(process.cwd(), 'dev-runtime', 'msfs-cli', 'msfs.exe');
const resolveDesktopMsfsCliPath = (configuredPath?: string) => {
  const developmentPath = getDevelopmentMsfsCliPath();
  return resolveMsfsCliPath({
    ...(configuredPath ? { configuredPath } : {}),
    ...(developmentPath && existsSync(developmentPath) ? { developmentPath } : {}),
    resourcesPath: getPackagedResourcesPath(),
  });
};
const getAppIconPath = () => join(getPackagedResourcesPath(), 'app-icon.png');
const getTtsVoiceSamplesPath = () =>
  join(
    app.isPackaged ? getPackagedResourcesPath() : join(process.cwd(), 'resources'),
    'tts',
    'confirmed-voices',
  );
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
    if (!parsed.success) return undefined;
    return {
      ...parsed.data,
      tts: {
        ...parsed.data.tts,
        speaker: alignTtsSpeakerToLocale(parsed.data.tts.speaker, guideLocale),
      },
    };
  } catch {
    return undefined;
  }
};

const writeStoredServiceSettings = async (settings: DesktopServiceSettings): Promise<void> => {
  await writeFile(getServiceSettingsPath(), JSON.stringify(settings), { mode: 0o600 });
};

const readStoredToolSettings = async (): Promise<DesktopToolSettings> => {
  try {
    const parsed = desktopToolSettingsSchema.safeParse(
      JSON.parse(await readFile(getToolSettingsPath(), 'utf8')),
    );
    return parsed.success ? parsed.data : { ...defaultDesktopToolSettings };
  } catch {
    return { ...defaultDesktopToolSettings };
  }
};

const writeStoredToolSettings = async (settings: DesktopToolSettings): Promise<void> => {
  await writeFile(getToolSettingsPath(), JSON.stringify(settings), { mode: 0o600 });
};

const ttsVoiceMimeTypes: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

const readTtsVoiceSamples = async (): Promise<DesktopTtsVoiceSample[]> => {
  try {
    const entries = await readdir(getTtsVoiceSamplesPath(), { withFileTypes: true });
    const samples = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const extension = extname(entry.name).toLowerCase();
          const mimeType = ttsVoiceMimeTypes[extension];
          if (!mimeType) return null;

          const baseName = basename(entry.name, extension);
          const speakerMarker = baseName.search(/_(?:zh|en)_(?:female|male)_/);
          if (speakerMarker <= 0) return null;

          const name = baseName.slice(0, speakerMarker);
          const speaker = baseName.slice(speakerMarker + 1);
          const locale = speaker.startsWith('en_') ? 'en-US' : 'zh-CN';
          const audio = await readFile(join(getTtsVoiceSamplesPath(), entry.name));

          return {
            name,
            speaker,
            locale,
            fileName: entry.name,
            dataUrl: `data:${mimeType};base64,${audio.toString('base64')}`,
          } satisfies DesktopTtsVoiceSample;
        }),
    );

    return samples
      .filter((sample): sample is DesktopTtsVoiceSample => sample !== null)
      .sort(
        (left, right) =>
          left.locale.localeCompare(right.locale) || left.name.localeCompare(right.name, 'zh-CN'),
      );
  } catch {
    return [];
  }
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

const visibleServiceCredentialsFromEnvironment = (
  environment: NodeJS.ProcessEnv,
): VisibleServiceCredentials => {
  const appId = environment.VOLCENGINE_SPEECH_APP_ID?.trim() ?? '';
  const accessToken = environment.VOLCENGINE_SPEECH_ACCESS_TOKEN?.trim() ?? '';
  return {
    deepseekApiKey: environment.DEEPSEEK_API_KEY?.trim() ?? '',
    sttAppId: appId,
    sttAccessToken: accessToken,
    ttsAppId: appId,
    ttsAccessToken: accessToken,
    searchApiKey: environment.VOLCENGINE_SEARCH_API_KEY?.trim() ?? '',
    bochaSearchApiKey: environment.BOCHA_SEARCH_API_KEY?.trim() ?? '',
  };
};

const getVisibleLocalServiceCredentials = (): VisibleServiceCredentials => {
  reloadLocalEnvironment(localEnvironmentPath);
  return visibleServiceCredentialsFromEnvironment(process.env);
};

const getEffectiveServiceEnvironment = async (
  services?: DesktopServiceSettings,
  credentials?: StoredServiceCredentials,
  tools?: DesktopToolSettings,
): Promise<NodeJS.ProcessEnv> => {
  reloadLocalEnvironment(localEnvironmentPath);
  const storedSettings = services ?? (await readStoredServiceSettings());
  const storedCredentials = credentials ?? (await readStoredServiceCredentials());
  const environment = applyDesktopServiceSettings(
    process.env,
    getInheritedEnvironment(),
    storedSettings ?? defaultDesktopServiceSettings,
    storedCredentials,
  );
  return applyDesktopToolSettings(environment, tools ?? (await readStoredToolSettings()));
};

const getVisibleEffectiveServiceCredentials = async (): Promise<VisibleServiceCredentials> => {
  const inherited = visibleServiceCredentialsFromEnvironment(getInheritedEnvironment());
  const stored = await readStoredServiceCredentials();
  const local = getVisibleLocalServiceCredentials();
  return Object.fromEntries(
    serviceCredentialKeys.map((key) => [key, inherited[key] || stored[key] || local[key] || '']),
  ) as VisibleServiceCredentials;
};

const hasEnabledMsfsTools = () =>
  Object.entries(msfsToolSettings).some(([name, enabled]) => name !== 'searchWeb' && enabled);

const createMsfsCliClientFromEnvironment = (environment: NodeJS.ProcessEnv): MsfsCliClient => {
  const configuredPath = environment.MSFS_CLI_PATH?.trim();
  const timeoutValue = Number(environment.MSFS_CLI_TIMEOUT_MS);
  const concurrencyValue = Number(environment.MSFS_CLI_MAX_CONCURRENCY);
  return new MsfsCliClient({
    executablePath: resolveDesktopMsfsCliPath(configuredPath),
    timeoutMs: Number.isInteger(timeoutValue) && timeoutValue >= 500 ? timeoutValue : 15_000,
    maxConcurrency:
      Number.isInteger(concurrencyValue) && concurrencyValue >= 1 ? concurrencyValue : 1,
  });
};

const getSharedMsfsClient = async (): Promise<MsfsCliClient> => {
  if (sharedMsfsClient) return sharedMsfsClient;
  sharedMsfsClientPromise ??= getEffectiveServiceEnvironment().then((environment) => {
    sharedMsfsClient = createMsfsCliClientFromEnvironment(environment);
    return sharedMsfsClient;
  });
  return sharedMsfsClientPromise;
};

const createMsfsConfigurationChecker = async (): Promise<MsfsConfigurationChecker> => {
  const environment = await getEffectiveServiceEnvironment();
  const client = await getSharedMsfsClient();
  const configuredPath = environment.MSFS_CLI_PATH?.trim();
  const executablePath = resolveDesktopMsfsCliPath(configuredPath);
  const timeoutValue = Number(environment.MSFS_CLI_TIMEOUT_MS);
  const concurrencyValue = Number(environment.MSFS_CLI_MAX_CONCURRENCY);
  return new MsfsConfigurationChecker({
    executablePath,
    timeoutMs: Number.isInteger(timeoutValue) && timeoutValue >= 500 ? timeoutValue : 15_000,
    maxConcurrency:
      Number.isInteger(concurrencyValue) && concurrencyValue >= 1 ? concurrencyValue : 1,
    client,
    packageSourcePath: join(
      getPackagedResourcesPath(),
      'msfs',
      'community',
      'msfs-native-cli-route-bridge',
    ),
  });
};

const getMsfsConnectionStatus = async (): Promise<MsfsConnectionStatus> => {
  if (!hasEnabledMsfsTools()) {
    return msfsConnectionStatusSchema.parse({
      visible: false,
      connected: false,
      message: 'MSFS 工具已关闭。',
      timestamp: new Date().toISOString(),
    });
  }
  const client = await getSharedMsfsClient();
  const result = await client.execute(['status'], statusDataSchema);
  const simulatorState = await client.execute(
    ['system', 'state', '--name', 'AircraftLoaded'],
    systemStateDataSchema,
  );
  const connected =
    (result.status === 'ok' && result.data.simconnect.connected) || simulatorState.status === 'ok';
  return msfsConnectionStatusSchema.parse({
    visible: true,
    connected,
    message: connected ? 'MSFS 游戏已连接。' : 'MSFS 游戏未连接。',
    timestamp: new Date().toISOString(),
  });
};

const publishMsfsConnectionStatus = (status: MsfsConnectionStatus) => {
  latestMsfsConnectionStatus = status;
  if (isLiveWindow(assistantWindow) && !assistantWindow.webContents.isDestroyed()) {
    assistantWindow.webContents.send('msfs:connection-status', status);
  }
};

const startMsfsConnectionMonitor = async () => {
  if (msfsConnectionMonitor) return;
  msfsConnectionMonitor = new MsfsConnectionMonitor({
    client: await getSharedMsfsClient(),
    isVisible: hasEnabledMsfsTools,
    onStatus: publishMsfsConnectionStatus,
  });
  msfsConnectionMonitor.start();
};

const stopMsfsConnectionMonitor = () => {
  msfsConnectionMonitor?.stop();
  msfsConnectionMonitor = null;
};

const stopMsfsDaemonForApp = async () => {
  let configuredPath: string | undefined;
  try {
    configuredPath = (await getEffectiveServiceEnvironment()).MSFS_CLI_PATH?.trim();
  } catch {
    // Shutdown must continue even if the optional environment file is unavailable.
  }
  await stopMsfsDaemon(resolveDesktopMsfsCliPath(configuredPath));
};

const runMsfsConfigurationDiagnostic = async (): Promise<MsfsConfigurationDiagnostic> => {
  try {
    return await (await createMsfsConfigurationChecker()).check();
  } catch {
    return msfsConfigurationDiagnosticSchema.parse({
      status: 'needs_setup',
      message: 'MSFS CLI 检测失败，请稍后重试。',
      checks: [
        {
          id: 'cli_runtime',
          status: 'error',
          message: '无法完成 MSFS CLI 检测。',
        },
      ],
      checkedAt: new Date().toISOString(),
    });
  }
};

const installBundledMsfsCommunityPackage = async () => {
  if (!app.isPackaged) return;
  const result = await installMsfsCommunityPackage({
    sourcePath: join(
      getPackagedResourcesPath(),
      'msfs',
      'community',
      'msfs-native-cli-route-bridge',
    ),
    userCfgCandidates: defaultMsfsUserConfigCandidates(),
    backupDirectory: join(app.getPath('userData'), 'msfs-community-backups'),
  });
  void getDiagnosticsLogger().append('main', {
    event: 'msfs_community_package_install',
    status: result.status,
    message: result.message,
    ...(result.userCfgPath ? { userCfgPath: result.userCfgPath } : {}),
    ...(result.communityPackagePath ? { communityPackagePath: result.communityPackagePath } : {}),
    ...(result.versionStorePath ? { versionStorePath: result.versionStorePath } : {}),
  });
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
    ...(Object.keys(sourceReadingPreferences).length > 0 ? { sourceReadingPreferences } : {}),
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
  if (shouldAutoStartLocalLiveKit(environment)) {
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

type DesktopSettingsSaveResult =
  | { ok: true; readiness: DesktopReadiness }
  | {
      ok: false;
      readiness: DesktopReadiness;
    };

const desktopSettingsFailure = (message: string): DesktopSettingsSaveResult => ({
  ok: false,
  readiness: { status: 'error', message, issues: [] },
});

const notifyLocaleSaved = (locale: GuideLocale) => {
  if (isLiveWindow(assistantWindow) && !assistantWindow.webContents.isDestroyed()) {
    assistantWindow.webContents.send('settings:locale-saved', locale);
  }
  if (isLiveWindow(sourceWindow) && !sourceWindow.webContents.isDestroyed()) {
    sourceWindow.webContents.send('settings:locale-saved', locale);
  }
  if (
    sourceView &&
    !sourceView.webContents.isDestroyed() &&
    sourceWindowState &&
    sourceWindowState.mode !== 'preview'
  ) {
    sourceView.webContents.reloadIgnoringCache();
  }
};

const restoreStoredServiceSettings = async (settings: DesktopServiceSettings | undefined) => {
  if (settings) {
    await writeStoredServiceSettings(settings);
    return;
  }
  await rm(getServiceSettingsPath(), { force: true });
};

const applyDesktopSettings = async (
  request: DesktopSettingsSaveRequest,
): Promise<DesktopSettingsSaveResult> => {
  void getDiagnosticsLogger().append('main', { event: 'settings_save_requested' });
  const hasCredentialUpdate = serviceCredentialKeys.some(
    (key) => request.credentials[key] !== undefined,
  );
  if (hasCredentialUpdate && !safeStorage.isEncryptionAvailable()) {
    return desktopSettingsFailure('系统加密服务不可用，未保存任何凭据。');
  }

  const previousLocale = guideLocale;
  const previousServices = await readStoredServiceSettings();
  const previousCredentials = await readStoredServiceCredentials();
  const previousTools = await readStoredToolSettings();
  const credentials = mergeCredentialUpdates(previousCredentials, request.credentials);
  const services: DesktopServiceSettings = {
    ...request.services,
    tts: {
      ...request.services.tts,
      speaker: alignTtsSpeakerToLocale(request.services.tts.speaker, request.locale),
    },
  };

  try {
    await writeStoredServiceSettings(services);
    await writeStoredToolSettings(request.tools);
    if (hasCredentialUpdate) await writeStoredServiceCredentials(credentials);
  } catch {
    await restoreStoredServiceSettings(previousServices);
    await writeStoredToolSettings(previousTools);
    if (hasCredentialUpdate) await writeStoredServiceCredentials(previousCredentials);
    return desktopSettingsFailure('无法安全保存服务配置，未保存任何内容。');
  }

  guideLocale = request.locale;
  msfsToolSettings = request.tools;
  const result = await startConfiguredAgent(true);
  if ('config' in result && result.readiness.status === 'ready') {
    try {
      await saveGuideLocale(guideLocale);
      notifyLocaleSaved(guideLocale);
      await msfsConnectionMonitor?.refresh();
      void getDiagnosticsLogger().append('main', { event: 'settings_save_succeeded' });
      return { ok: true, readiness: result.readiness };
    } catch {
      // Restore the last working configuration below.
    }
  }

  await restoreStoredServiceSettings(previousServices);
  await writeStoredToolSettings(previousTools);
  if (hasCredentialUpdate) {
    await writeStoredServiceCredentials(previousCredentials);
  }
  guideLocale = previousLocale;
  msfsToolSettings = previousTools;
  const rollback = await startConfiguredAgent(true);
  void getDiagnosticsLogger().append('main', { event: 'settings_save_rolled_back' });
  return {
    ok: false,
    readiness: 'readiness' in rollback ? rollback.readiness : result.readiness,
  };
};

const loadRenderer = async (window: BrowserWindow, hash: string) => {
  if (isDevelopment) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`);
    return;
  }
  await window.loadFile(join(mainDir, '../renderer/index.html'), { hash });
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

const isSourceMoreMenuSender = (sender: Electron.WebContents) =>
  Boolean(
    isLiveWindow(sourceMoreMenuWindow) &&
    !sourceMoreMenuWindow.webContents.isDestroyed() &&
    sender === sourceMoreMenuWindow.webContents,
  );

const isSafeWebUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const runPackagedRuntimeSmoke = (): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    let ready = false;
    const timeout = { value: undefined as NodeJS.Timeout | undefined };
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout.value) clearTimeout(timeout.value);
      resolve(result);
    };
    let child: ReturnType<typeof utilityProcess.fork>;
    try {
      child = utilityProcess.fork(getRuntimeSmokeProcessPath(), [], {
        cwd: process.cwd(),
        env: process.env,
        serviceName: 'Xiaoxiao Packaged Runtime Smoke',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      console.error(error);
      resolve(false);
      return;
    }
    child.stdout?.on('data', (chunk) => console.log(String(chunk)));
    child.stderr?.on('data', (chunk) => console.error(String(chunk)));
    child.on('message', (message: { type?: string; message?: string }) => {
      if (message?.type === 'runtime-smoke-ready') ready = true;
      if (message?.type === 'runtime-smoke-error') {
        console.error(message.message ?? 'Packaged runtime smoke failed.');
      }
    });
    child.on('error', (type, location) => {
      console.error(`${type}: ${location}`);
      finish(false);
    });
    child.on('exit', (code) => finish(ready && code === 0));
    timeout.value = setTimeout(() => {
      child.kill();
      finish(false);
    }, 30_000);
  });

const createExploreService = async (): Promise<ExploreService | null> => {
  const environment = await getEffectiveServiceEnvironment();
  let llmConfig: ReturnType<typeof loadLlmConfig>;
  try {
    llmConfig = loadLlmConfig(environment);
  } catch {
    return null;
  }
  return new ExploreService(
    new DeepSeekExplorePlanner(llmConfig),
    new EncyclopediaService([
      new WikipediaSearchPageProvider(),
      new BaiduBaikeSearchPageProvider(),
    ]),
    new VideoService([
      new YouTubeSearchPageProvider(),
      new BilibiliSearchPageProvider(),
    ] satisfies VideoProvider[]),
  );
};

const getExploreMsfsContext = async (signal: AbortSignal) => {
  const environment = await getEffectiveServiceEnvironment();
  let msfsConfig: ReturnType<typeof loadMsfsConfig>;
  try {
    msfsConfig = loadMsfsConfig(environment);
  } catch {
    return undefined;
  }
  const client = await getSharedMsfsClient();
  const service = new MsfsGuideService(client, {
    trackIntervalMs: msfsConfig.trackIntervalMs,
    trackMaximumPoints: msfsConfig.trackMaximumPoints,
  });
  try {
    return await new MsfsExploreContextProvider(service).get(signal);
  } finally {
    await service.close();
  }
};

const getExploreController = () =>
  (exploreController ??= new ExploreController({
    createService: createExploreService,
    getMsfsContext: getExploreMsfsContext,
    present: async (result) => openExplorePreview(result),
  }));

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
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(mainDir, '../preload/index.cjs'),
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

const setSourceWindowBounds = (bounds: Electron.Rectangle) => {
  if (!isLiveWindow(sourceWindow)) return;
  const window = sourceWindow;
  const currentBounds = window.getBounds();
  if (
    currentBounds.x === bounds.x &&
    currentBounds.y === bounds.y &&
    currentBounds.width === bounds.width &&
    currentBounds.height === bounds.height
  ) {
    return;
  }
  isPositioningSource = true;
  window.setBounds(bounds);
  setTimeout(() => {
    isPositioningSource = false;
  }, 0);
};

const isSourceWindowDisplaySized = (bounds: Electron.Rectangle) => {
  const display = screen.getDisplayMatching(bounds);
  return bounds.width >= display.workArea.width - 2 && bounds.height >= display.workArea.height - 2;
};

const setSourceViewBounds = () => {
  if (!isLiveWindow(sourceWindow) || !sourceView || sourceView.webContents.isDestroyed()) return;
  sourceView.setBounds(getSourceViewBounds(sourceWindow.getContentSize()));
};

const canNavigateSourceHistory = (contents: Electron.WebContents, offset: -1 | 1) => {
  const entries = contents.navigationHistory.getAllEntries();
  const targetIndex = contents.navigationHistory.getActiveIndex() + offset;
  const targetEntry = entries[targetIndex];
  return Boolean(targetEntry && isSafeWebUrl(targetEntry.url));
};

const getSourceNavigationState = (view = sourceView): SourceWindowNavigation => {
  const contents = view && !view.webContents.isDestroyed() ? view.webContents : null;
  return {
    pageTitle: contents?.getTitle() || selectedSource?.title || '',
    canGoBack: contents
      ? contents.navigationHistory.canGoBack() && canNavigateSourceHistory(contents, -1)
      : false,
    canGoForward: contents
      ? contents.navigationHistory.canGoForward() && canNavigateSourceHistory(contents, 1)
      : false,
    isLoading: contents?.isLoading() ?? false,
    isVideoFullscreen: isSourceVideoFullscreen,
  };
};

const resetSourceNavigationState = () => {
  sourceNavigationState = { ...defaultSourceNavigationState };
};

const publishSourceNavigationState = () => {
  if (!sourceWindowState || sourceWindowState.mode === 'preview') return;
  sourceNavigationState = getSourceNavigationState();
  publishSourceWindowState({ ...sourceWindowState });
};

const leaveSourceVideoFullscreen = (publish = true) => {
  const restoreBounds = sourceVideoFullscreenRestoreBounds;
  if (!isSourceVideoFullscreen && !restoreBounds) return;
  isSourceVideoFullscreen = false;
  sourceVideoFullscreenRestoreBounds = null;
  if (restoreBounds) setSourceWindowBounds(restoreBounds);
  sourceNavigationState = {
    ...getSourceNavigationState(),
    isVideoFullscreen: false,
  };
  if (publish) publishSourceNavigationState();
};

const enterSourceVideoFullscreen = (view: WebContentsView) => {
  if (!isLiveWindow(sourceWindow) || sourceView !== view || isSourceVideoFullscreen) return;
  const currentBounds = sourceWindow.getBounds();
  const restoreBounds =
    sourceWindowNormalBounds && !isSourceWindowDisplaySized(sourceWindowNormalBounds)
      ? sourceWindowNormalBounds
      : currentBounds;
  const display = screen.getDisplayMatching(restoreBounds);
  sourceVideoFullscreenRestoreBounds = restoreBounds;
  isSourceVideoFullscreen = true;
  setSourceWindowBounds(getLandscapeSourceWindowBounds(restoreBounds, display.workArea));
  sourceNavigationState = {
    ...getSourceNavigationState(view),
    isVideoFullscreen: true,
  };
  publishSourceNavigationState();
};

const resetSourcePageZoom = () => {
  sourcePageZoomPercent = resetSourcePageZoomPercent();
};

const resetSourceReadingPreference = () => {
  sourceReadingMode = defaultSourceReadingPreference.mode;
  resetSourcePageZoom();
};

const currentSourceReadingUrl = () =>
  sourceWindowState && sourceWindowState.mode !== 'preview'
    ? sourceWindowState.currentUrl
    : selectedSource?.url;

const persistSourceReadingPreference = (
  update: Partial<Pick<ReturnType<typeof sourceReadingPreferenceForUrl>, 'mode' | 'zoomPercent'>>,
) => {
  const currentUrl = currentSourceReadingUrl();
  if (!currentUrl) return;
  sourceReadingPreferences = updateSourceReadingPreference(
    sourceReadingPreferences,
    currentUrl,
    update,
  );
  schedulePersistWindowState();
};

const applySourcePageZoom = () => {
  if (!sourceView || sourceView.webContents.isDestroyed()) return;
  sourceView.webContents.setZoomFactor(sourcePageZoomFactorFromPercent(sourcePageZoomPercent));
};

const setSourcePageZoomPercent = (percent: number) => {
  sourcePageZoomPercent = clampSourcePageZoomPercent(percent);
  applySourcePageZoom();
  persistSourceReadingPreference({ zoomPercent: sourcePageZoomPercent });
  if (!sourceWindowState || sourceWindowState.mode === 'preview') return sourcePageZoomPercent;
  publishSourceWindowState({
    ...sourceWindowState,
    pageZoomPercent: sourcePageZoomPercent,
    readingMode: sourceReadingMode,
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
  leaveSourceVideoFullscreen(false);
  if (!sourceView) return;
  const view = sourceView;
  sourceView = null;
  if (sourceViewAttached && isLiveWindow(sourceWindow)) {
    sourceWindow.contentView.removeChildView(view);
  }
  sourceViewAttached = false;
  if (!view.webContents.isDestroyed()) {
    view.webContents.session.webRequest.onBeforeSendHeaders(null);
    view.webContents.session.webRequest.onHeadersReceived(null);
    view.webContents.close();
  }
};

const publishSourceWindowState = (state: SourceWindowState) => {
  const nextState =
    state.mode === 'preview' ? state : { ...state, navigation: sourceNavigationState };
  sourceWindowState = nextState;
  if (isLiveWindow(sourceWindow) && !sourceWindow.webContents.isDestroyed()) {
    sourceWindow.webContents.send('source:state', nextState);
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
  sourceNavigationState = {
    ...getSourceNavigationState(view),
    isLoading: false,
  };
  destroySourceView();
  publishSourceWindowState({
    mode: 'error',
    preview: sourcePreview,
    source: selectedSource,
    currentUrl,
    pageZoomPercent: sourcePageZoomPercent,
    readingMode: sourceReadingMode,
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
    isSourceVideoFullscreen ||
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

const restoreSourceWindow = (focus: boolean) => {
  if (!isLiveWindow(sourceWindow)) return false;
  if (sourceWindow.isMinimized()) sourceWindow.restore();
  positionSourceNextToAssistant();
  sourceWindow.show();
  if (focus) sourceWindow.focus();
  return true;
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
  readingMode?: SourceReadingMode;
};

const createSourceView = () => {
  let navigation: SourceNavigation | null = null;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      disableHtmlFullscreenWindowResize: true,
      // Keep one named Chromium profile for all source pages. Its cookies and
      // user-completed verification state survive document recreation and restarts.
      partition: sourceSessionPartition,
      sandbox: true,
    },
  });
  const desktopUserAgent = view.webContents.getUserAgent();
  const applySourceReadingMode = () => {
    view.webContents.setUserAgent(
      sourceReadingMode === 'mobile' ? sourceMobileUserAgent : desktopUserAgent,
    );
  };
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
    sourceNavigationState = {
      ...getSourceNavigationState(view),
      isLoading: false,
    };
    publishSourceWindowState({
      mode: 'ready',
      preview: sourcePreview,
      source: navigation.source,
      currentUrl: navigation.currentUrl,
      pageZoomPercent: sourcePageZoomPercent,
      readingMode: sourceReadingMode,
    });
  };

  sourceView = view;
  sourceViewAttached = false;
  view.webContents.setWindowOpenHandler((details) => {
    if (!isSafeWebUrl(details.url) || sourceView !== view || view.webContents.isDestroyed()) {
      return { action: 'deny' };
    }
    queueMicrotask(() => {
      if (sourceView !== view || view.webContents.isDestroyed()) return;
      void view.webContents.loadURL(details.url).catch((error: unknown) => {
        if (!navigation || sourceView !== view) return;
        failSourceLoad(
          view,
          navigation.currentUrl,
          'network',
          error instanceof Error ? `网络加载失败：${error.message}` : '网络加载失败。',
        );
      });
    });
    return { action: 'deny' };
  });
  view.webContents.on('enter-html-full-screen', () => enterSourceVideoFullscreen(view));
  view.webContents.on('leave-html-full-screen', () => leaveSourceVideoFullscreen());
  const isAllowedSourceFullscreenRequest = (
    webContents: Electron.WebContents | null,
    requestingUrl: string,
  ) => webContents === view.webContents && sourceView === view && isSafeWebUrl(requestingUrl);
  view.webContents.session.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) =>
      permission === 'fullscreen' &&
      isAllowedSourceFullscreenRequest(webContents, details.requestingUrl ?? requestingOrigin),
  );
  view.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback, details) =>
      callback(
        permission === 'fullscreen' &&
          isAllowedSourceFullscreenRequest(webContents, details.requestingUrl),
      ),
  );
  view.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: withSourceAcceptLanguage(details.requestHeaders, guideLocale) });
  });
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
    sourceNavigationState = {
      ...getSourceNavigationState(view),
      pageTitle: navigation.source.title,
      isLoading: true,
    };
    publishSourceWindowState({
      mode: 'loading',
      preview: sourcePreview!,
      source: navigation.source,
      currentUrl: targetUrl,
      pageZoomPercent: sourcePageZoomPercent,
      readingMode: sourceReadingMode,
    });
    startSourceLoadTimer(view, targetUrl);
  });
  view.webContents.on('did-navigate', (_event, targetUrl) => {
    if (!navigation || sourceView !== view) return;
    navigation.currentUrl = targetUrl;
    sourceNavigationState = getSourceNavigationState(view);
    if (sourceWindowState && sourceWindowState.mode !== 'preview') {
      publishSourceWindowState({
        ...sourceWindowState,
        currentUrl: targetUrl,
      });
    }
  });
  view.webContents.on('did-navigate-in-page', (_event, targetUrl, isMainFrame) => {
    if (!navigation || !isMainFrame || sourceView !== view) return;
    navigation.currentUrl = targetUrl;
    sourceNavigationState = getSourceNavigationState(view);
    if (sourceWindowState && sourceWindowState.mode !== 'preview') {
      publishSourceWindowState({
        ...sourceWindowState,
        currentUrl: targetUrl,
      });
    }
  });
  view.webContents.on('page-title-updated', (_event, title) => {
    if (!navigation || sourceView !== view) return;
    sourceNavigationState = {
      ...getSourceNavigationState(view),
      pageTitle: title,
    };
    publishSourceNavigationState();
  });
  view.webContents.on('did-stop-loading', () => {
    if (!navigation || sourceView !== view) return;
    sourceNavigationState = {
      ...getSourceNavigationState(view),
      isLoading: false,
    };
    publishSourceNavigationState();
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
    sourceNavigationState = {
      ...getSourceNavigationState(view),
      pageTitle: source.title,
      isLoading: true,
    };
    publishSourceWindowState({
      mode: 'loading',
      preview: sourcePreview!,
      source,
      currentUrl: initialUrl,
      pageZoomPercent: sourcePageZoomPercent,
      readingMode: sourceReadingMode,
    });
    startSourceLoadTimer(view, initialUrl);
    applySourceReadingMode();
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
  const preference = sourceReadingPreferenceForUrl(sourceReadingPreferences, initialUrl);
  sourceReadingMode = options.readingMode ?? preference.mode;
  sourcePageZoomPercent = preference.zoomPercent;
  const view = await ensurePrewarmedSourceView();
  if (!view || sourceView !== view || view.webContents.isDestroyed()) return false;

  if (!sourceViewLoad) return false;
  applySourcePageZoom();
  sourceViewLoad(source, initialUrl);
  return true;
};

const currentSourceUrl = () =>
  sourceWindowState && sourceWindowState.mode !== 'preview'
    ? sourceWindowState.currentUrl
    : selectedSource?.url;

const setSourceReadingMode = async (mode: SourceReadingMode) => {
  if (!selectedSource || mode === sourceReadingMode) return Boolean(selectedSource);
  const currentUrl = currentSourceUrl();
  if (!currentUrl || !isSafeWebUrl(currentUrl)) return false;
  sourceReadingMode = mode;
  persistSourceReadingPreference({ mode });
  return showRemoteSource(selectedSource, { url: currentUrl, readingMode: mode });
};

const setSourcePageZoom = (action: 'in' | 'out' | 'reset') => {
  if (!sourceWindowState || sourceWindowState.mode === 'preview') return null;
  if (action === 'reset') return setSourcePageZoomPercent(resetSourcePageZoomPercent());
  const direction: SourcePageZoomDirection = action;
  return setSourcePageZoomPercent(stepSourcePageZoomPercent(sourcePageZoomPercent, direction));
};

const openCurrentSourceExternal = async () => {
  const currentUrl = currentSourceUrl();
  if (!currentUrl || !isSafeWebUrl(currentUrl)) return false;
  await shell.openExternal(currentUrl);
  return true;
};

const clearSourceMoreMenuBlurTimer = () => {
  if (!sourceMoreMenuBlurTimer) return;
  clearTimeout(sourceMoreMenuBlurTimer);
  sourceMoreMenuBlurTimer = null;
};

const hideSourceMoreMenu = () => {
  clearSourceMoreMenuBlurTimer();
  if (isLiveWindow(sourceMoreMenuWindow) && sourceMoreMenuWindow.isVisible()) {
    sourceMoreMenuWindow.hide();
  }
};

const hideSourceMoreMenuAfterBlur = () => {
  clearSourceMoreMenuBlurTimer();
  sourceMoreMenuBlurTimer = setTimeout(() => {
    sourceMoreMenuBlurTimer = null;
    hideSourceMoreMenu();
  }, 100);
};

const destroySourceMoreMenu = () => {
  clearSourceMoreMenuBlurTimer();
  sourceMoreMenuPrewarm = null;
  if (isLiveWindow(sourceMoreMenuWindow)) sourceMoreMenuWindow.destroy();
  sourceMoreMenuWindow = null;
};

const positionSourceMoreMenu = () => {
  if (!isLiveWindow(sourceWindow) || !isLiveWindow(sourceMoreMenuWindow)) return;
  const sourceBounds = sourceWindow.getBounds();
  const display = screen.getDisplayMatching(sourceBounds);
  const workArea = display.workArea;
  const x = Math.max(
    workArea.x + 8,
    Math.min(
      sourceBounds.x + sourceBounds.width - sourceMoreMenuSize.width - 6,
      workArea.x + workArea.width - sourceMoreMenuSize.width - 8,
    ),
  );
  const y = Math.max(
    workArea.y + 8,
    Math.min(
      sourceBounds.y + SOURCE_TITLE_BAR_HEIGHT - 2,
      workArea.y + workArea.height - sourceMoreMenuSize.height - 8,
    ),
  );
  sourceMoreMenuWindow.setBounds({ x, y, ...sourceMoreMenuSize });
};

const getSourceMoreMenuState = (): SourceMoreMenuState | null => {
  if (!sourceWindowState || sourceWindowState.mode === 'preview') return null;
  return sourceMoreMenuStateSchema.parse({
    locale: guideLocale,
    readingMode: sourceReadingMode,
    pageZoomPercent: sourcePageZoomPercent,
    canZoomOut: canZoomSourcePageOut(sourcePageZoomPercent),
    canZoomIn: canZoomSourcePageIn(sourcePageZoomPercent),
  });
};

const publishSourceMoreMenuState = (state: SourceMoreMenuState) => {
  if (!isLiveWindow(sourceMoreMenuWindow) || sourceMoreMenuWindow.webContents.isDestroyed()) {
    return;
  }
  sourceMoreMenuWindow.webContents.send('source-more-menu:state', state);
};

const ensureSourceMoreMenuWindow = async (): Promise<BrowserWindow | null> => {
  if (isLiveWindow(sourceMoreMenuWindow)) return sourceMoreMenuWindow;
  if (sourceMoreMenuPrewarm) return sourceMoreMenuPrewarm;
  const parentWindow = sourceWindow;
  if (!isLiveWindow(parentWindow)) return null;
  const prewarm = (async () => {
    const window = new BrowserWindow({
      parent: parentWindow,
      width: sourceMoreMenuSize.width,
      height: sourceMoreMenuSize.height,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(mainDir, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    sourceMoreMenuWindow = window;
    window.setAlwaysOnTop(true, 'floating');
    attachDevelopmentDiagnostics(window);
    window.on('blur', hideSourceMoreMenuAfterBlur);
    window.on('closed', () => {
      sourceMoreMenuWindow = releaseWindowReference(sourceMoreMenuWindow, window);
    });
    try {
      await loadRenderer(window, 'source-menu');
      return sourceWindow === parentWindow && isLiveWindow(window) ? window : null;
    } catch (error) {
      console.error('Failed to prewarm source more menu', error);
      if (!window.isDestroyed()) window.destroy();
      sourceMoreMenuWindow = releaseWindowReference(sourceMoreMenuWindow, window);
      return null;
    }
  })();
  sourceMoreMenuPrewarm = prewarm;
  try {
    return await prewarm;
  } finally {
    if (sourceMoreMenuPrewarm === prewarm) sourceMoreMenuPrewarm = null;
  }
};

const showSourceMoreMenu = async () => {
  clearSourceMoreMenuBlurTimer();
  const state = getSourceMoreMenuState();
  if (!isLiveWindow(sourceWindow) || !state) return false;
  const window = await ensureSourceMoreMenuWindow();
  if (!window || sourceMoreMenuWindow !== window || !isLiveWindow(sourceWindow)) return false;
  if (window.isVisible()) {
    hideSourceMoreMenu();
    return true;
  }
  positionSourceMoreMenu();
  publishSourceMoreMenuState(state);
  window.show();
  window.focus();
  return true;
};

const performSourceMoreMenuAction = async (action: SourceMoreMenuAction) => {
  let succeeded: boolean;
  if (action === 'mobile' || action === 'desktop') {
    succeeded = await setSourceReadingMode(action);
  } else if (action === 'zoom-out') {
    succeeded = setSourcePageZoom('out') !== null;
  } else if (action === 'zoom-reset') {
    succeeded = setSourcePageZoom('reset') !== null;
  } else if (action === 'zoom-in') {
    succeeded = setSourcePageZoom('in') !== null;
  } else {
    succeeded = await openCurrentSourceExternal();
  }
  hideSourceMoreMenu();
  if (isLiveWindow(sourceWindow)) sourceWindow.focus();
  return succeeded;
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
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(mainDir, '../preload/index.cjs'),
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
    icon: getAppIconPath(),
    webPreferences: {
      preload: join(mainDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  sourceWindow = window;
  sourceWindowNormalBounds = window.getBounds();
  sourceWindowFollowMode = startSourceWindowSession();
  window.setAlwaysOnTop(true, 'floating');
  attachDevelopmentDiagnostics(window);
  window.on('enter-html-full-screen', () => {
    if (sourceView) enterSourceVideoFullscreen(sourceView);
  });
  window.on('leave-html-full-screen', () => leaveSourceVideoFullscreen());
  window.on('resize', () => {
    if (sourceWindow !== window || !isLiveWindow(window)) return;
    setSourceViewBounds();
    positionSourceMoreMenu();
    if (!isSourceVideoFullscreen && !isSourceWindowDisplaySized(window.getBounds())) {
      sourceWindowNormalBounds = window.getBounds();
      schedulePersistWindowState();
    }
  });
  window.on('moved', () => {
    if (sourceWindow !== window || !isLiveWindow(window)) return;
    positionSourceMoreMenu();
    if (isSourceVideoFullscreen) return;
    if (!isSourceWindowDisplaySized(window.getBounds()))
      sourceWindowNormalBounds = window.getBounds();
    sourceWindowFollowMode = updateSourceWindowFollowMode(
      sourceWindowFollowMode,
      isPositioningSource,
    );
  });
  const releaseSourceWindow = () => {
    if (sourceWindow !== window) return;
    destroySourceMoreMenu();
    leaveSourceVideoFullscreen(false);
    destroySourceView();
    sourceWindow = releaseWindowReference(sourceWindow, window);
    sourcePreview = null;
    selectedSource = null;
    sourceWindowState = null;
    resetSourceNavigationState();
    sourceWindowNormalBounds = null;
    resetSourceReadingPreference();
    sourceWindowFollowMode = startSourceWindowSession();
  };
  window.on('close', releaseSourceWindow);
  window.on('closed', releaseSourceWindow);
  window.on('hide', hideSourceMoreMenu);
  await loadRenderer(window, 'source');
  void ensureSourceMoreMenuWindow();
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

ipcMain.handle('msfs:get-connection-status', async (event): Promise<MsfsConnectionStatus> => {
  if (!isAssistantSender(event.sender) && !isUtilitySender(event.sender)) {
    return msfsConnectionStatusSchema.parse({
      visible: false,
      connected: false,
      message: '无权读取 MSFS 游戏连接状态。',
      timestamp: new Date().toISOString(),
    });
  }
  if (isAssistantSender(event.sender)) {
    await msfsConnectionMonitor?.refresh();
    return latestMsfsConnectionStatus;
  }
  return getMsfsConnectionStatus();
});

ipcMain.handle('msfs:check-configuration', async (event): Promise<MsfsConfigurationDiagnostic> => {
  if (!isUtilitySender(event.sender)) {
    return msfsConfigurationDiagnosticSchema.parse({
      status: 'needs_setup',
      message: '无权检测 MSFS 配置。',
      checks: [],
      checkedAt: new Date().toISOString(),
    });
  }
  return runMsfsConfigurationDiagnostic();
});

ipcMain.handle('msfs:get-tool-settings', async (event): Promise<DesktopToolSettings> => {
  if (!isUtilitySender(event.sender)) return { ...defaultDesktopToolSettings };
  return readStoredToolSettings();
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
    tools: await readStoredToolSettings(),
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

ipcMain.handle(
  'settings:get-credential-status',
  async (event): Promise<ServiceCredentialStatus> => {
    if (!isUtilitySender(event.sender))
      return emptyServiceCredentialStatus('无权访问服务凭据状态。');
    return getServiceCredentialStatus();
  },
);

ipcMain.handle(
  'settings:get-visible-local-credentials',
  async (event): Promise<VisibleServiceCredentials> => {
    if (!isUtilitySender(event.sender)) {
      return {
        deepseekApiKey: '',
        sttAppId: '',
        sttAccessToken: '',
        ttsAppId: '',
        ttsAccessToken: '',
        searchApiKey: '',
        bochaSearchApiKey: '',
      };
    }
    return getVisibleEffectiveServiceCredentials();
  },
);

ipcMain.handle('settings:get-service-settings', async (event): Promise<DesktopServiceSettings> => {
  if (!isUtilitySender(event.sender)) return defaultDesktopServiceSettings;
  const environment = await getEffectiveServiceEnvironment();
  const configuration = checkDesktopConfiguration(environment);
  return configuration.ok
    ? serviceSettingsFromConfig(configuration.config)
    : ((await readStoredServiceSettings()) ?? defaultDesktopServiceSettings);
});

ipcMain.handle(
  'settings:get-tts-voice-samples',
  async (event): Promise<DesktopTtsVoiceSample[]> => {
    if (!isUtilitySender(event.sender)) return [];
    return readTtsVoiceSamples();
  },
);

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

ipcMain.handle('settings:save-settings', async (event, value: unknown) => {
  if (!isUtilitySender(event.sender)) return desktopSettingsFailure('无权保存设置。');
  const parsed = desktopSettingsSaveRequestSchema.safeParse(value);
  if (!parsed.success) return desktopSettingsFailure('设置格式无效，未保存任何内容。');
  return applyDesktopSettings(parsed.data);
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
  if (!restoreSourceWindow(false)) return false;
  return selectedSource ? showRemoteSource(selectedSource) : false;
});

const openCompanionPreview = async (preview: CompanionPreview) => {
  sourcePreview = preview;
  selectedSource = null;
  destroySourceView();
  resetSourceNavigationState();
  resetSourceReadingPreference();
  publishSourceWindowState({ mode: 'preview', preview });
  if (!isLiveWindow(sourceWindow)) await createSourceWindow();
  if (!restoreSourceWindow(true)) return false;
  publishSourceWindowState({ mode: 'preview', preview });
  void ensurePrewarmedSourceView();
  return true;
};

const openExplorePreview = async (result: ExploreResult) => {
  if (
    isLiveWindow(sourceWindow) &&
    !sourceWindow.isVisible() &&
    sourcePreview?.type === 'explore.result' &&
    sourcePreview.result === result
  ) {
    return restoreSourceWindow(true);
  }
  return openCompanionPreview({ type: 'explore.result', result });
};

ipcMain.handle('source:open-preview', async (event, value: unknown) => {
  if (!isLiveWindow(assistantWindow) || !isAssistantSender(event.sender)) return false;
  const parsed = guideSourcesMessageSchema.safeParse(value);
  if (!parsed.success || parsed.data.sources.length === 0) return false;
  return openCompanionPreview(parsed.data);
});

ipcMain.handle('explore:request', async (event, value: unknown) => {
  if (!isLiveWindow(assistantWindow) || !isAssistantSender(event.sender)) {
    return { ok: false, code: 'configuration', message: '不允许的探索请求。' };
  }
  const parsed = exploreRequestSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, code: 'configuration', message: '探索请求格式无效。' };
  }
  return getExploreController().execute(parsed.data);
});

ipcMain.handle('explore:cancel', (event) => {
  if (!isAssistantSender(event.sender)) return false;
  exploreController?.cancel();
  return true;
});

ipcMain.on('explore:prefill-suggestion', (event, value: unknown) => {
  if (!isSourceSender(event.sender) || !isLiveWindow(assistantWindow)) return;
  const parsed = exploreSuggestionSchema.safeParse(value);
  if (!parsed.success) return;
  assistantWindow.webContents.send('explore:prefill-suggestion', parsed.data.text);
  assistantWindow.show();
  assistantWindow.focus();
});

ipcMain.handle('source:get-state', (event) =>
  isSourceSender(event.sender) ? sourceWindowState : null,
);

ipcMain.handle('source:select', async (event, url: string) => {
  if (!isSourceSender(event.sender) || !sourcePreview) return false;
  const source = companionPreviewSources(sourcePreview).find((candidate) => candidate.url === url);
  if (!source) return false;
  return showRemoteSource(source);
});

ipcMain.handle('source:back', (event) => {
  if (!isSourceSender(event.sender) || !sourcePreview) return false;
  destroySourceView();
  selectedSource = null;
  resetSourceNavigationState();
  resetSourceReadingPreference();
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

ipcMain.handle('source:navigate', (event, action: unknown) => {
  if (
    !isSourceSender(event.sender) ||
    !sourceView ||
    sourceView.webContents.isDestroyed() ||
    !sourceWindowState ||
    sourceWindowState.mode === 'preview'
  ) {
    return false;
  }
  const contents = sourceView.webContents;
  if (action === 'back') {
    if (!contents.navigationHistory.canGoBack() || !canNavigateSourceHistory(contents, -1)) {
      return false;
    }
    contents.navigationHistory.goBack();
  } else if (action === 'forward') {
    if (!contents.navigationHistory.canGoForward() || !canNavigateSourceHistory(contents, 1)) {
      return false;
    }
    contents.navigationHistory.goForward();
  } else if (action === 'reload') {
    contents.reload();
  } else if (action === 'stop') {
    contents.stop();
    sourceNavigationState = {
      ...getSourceNavigationState(),
      isLoading: false,
    };
    publishSourceNavigationState();
  } else {
    return false;
  }
  if (action !== 'stop') publishSourceNavigationState();
  return true;
});

ipcMain.handle('source:set-page-zoom', (event, action: unknown) => {
  if (
    !isSourceSender(event.sender) ||
    (action !== 'in' && action !== 'out' && action !== 'reset')
  ) {
    return null;
  }
  return setSourcePageZoom(action);
});

ipcMain.handle('source:show-more-menu', (event) =>
  isSourceSender(event.sender) ? showSourceMoreMenu() : false,
);

ipcMain.handle('source-more-menu:get-state', (event) =>
  isSourceMoreMenuSender(event.sender) ? getSourceMoreMenuState() : null,
);

ipcMain.handle('source-more-menu:perform', async (event, action: unknown) => {
  if (!isSourceMoreMenuSender(event.sender)) return false;
  const parsed = sourceMoreMenuActionSchema.safeParse(action);
  return parsed.success ? performSourceMoreMenuAction(parsed.data) : false;
});

ipcMain.handle('source-more-menu:close', (event) => {
  if (!isSourceMoreMenuSender(event.sender)) return;
  hideSourceMoreMenu();
});

ipcMain.handle('source:set-reading-mode', async (event, mode: unknown) => {
  if (!isSourceSender(event.sender) || (mode !== 'mobile' && mode !== 'desktop')) return false;
  return setSourceReadingMode(mode);
});

ipcMain.handle('source:open-current-external', async (event) => {
  if (!isSourceSender(event.sender)) return false;
  return openCurrentSourceExternal();
});

ipcMain.handle('source:minimize', (event) => {
  if (!isSourceSender(event.sender) || !isLiveWindow(sourceWindow)) return false;
  sourceWindow.hide();
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
  applyBundledGeoEnvironment(getPackagedResourcesPath());
  if (process.env.MSFS_PACKAGED_RUNTIME_SMOKE === '1') {
    const passed = await runPackagedRuntimeSmoke();
    console.log(`Packaged runtime smoke: ${passed ? 'passed' : 'failed'}`);
    app.exit(passed ? 0 : 1);
    return;
  }
  storedWindowState = readStoredWindowState(getWindowStatePath());
  sourceReadingPreferences = storedWindowState.sourceReadingPreferences ?? {};
  guideLocale = await readStoredGuideLocale();
  msfsToolSettings = await readStoredToolSettings();
  await createAssistantWindow();
  await installBundledMsfsCommunityPackage();
  await startMsfsConnectionMonitor();
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
  stopMsfsConnectionMonitor();
  globalPushToTalk.dispose();
  persistWindowState();
  void agentRuntime
    .stop()
    .finally(() => localLiveKitRuntime.stop())
    .finally(() => stopMsfsDaemonForApp())
    .finally(() => {
      shutdownComplete = true;
      app.quit();
    });
});
app.on('activate', () => {
  if (!isLiveWindow(assistantWindow)) void createAssistantWindow();
});
