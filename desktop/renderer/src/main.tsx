import {
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useDataChannel,
  useRpc,
  useSession,
  useSessionMessages,
  useTrackToggle,
  useTrackVolume,
  type UseSessionReturn,
} from '@livekit/components-react';
import { ConnectionState, serializers, TokenSource, Track } from 'livekit-client';
import { BrowserIcon } from '@phosphor-icons/react/dist/csr/Browser';
import { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen';
import { DesktopIcon } from '@phosphor-icons/react/dist/csr/Desktop';
import { DeviceMobileIcon } from '@phosphor-icons/react/dist/csr/DeviceMobile';
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { CompassIcon } from '@phosphor-icons/react/dist/csr/Compass';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree';
import { EyeClosedIcon } from '@phosphor-icons/react/dist/csr/EyeClosed';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { HeartIcon } from '@phosphor-icons/react/dist/csr/Heart';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { KeyboardIcon } from '@phosphor-icons/react/dist/csr/Keyboard';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus';
import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt';
import { PhoneCallIcon } from '@phosphor-icons/react/dist/csr/PhoneCall';
import { PhoneDisconnectIcon } from '@phosphor-icons/react/dist/csr/PhoneDisconnect';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { PowerIcon } from '@phosphor-icons/react/dist/csr/Power';
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/csr/SpeakerHigh';
import { SparkleIcon } from '@phosphor-icons/react/dist/csr/Sparkle';
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop';
import { VideoCameraIcon } from '@phosphor-icons/react/dist/csr/VideoCamera';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { WaveformIcon } from '@phosphor-icons/react/dist/csr/Waveform';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { DesktopReadiness } from '../../../shared/desktop-contracts.js';
import type { AboutInfo, AboutLinkId, AboutSupportChannel } from '../../../shared/about-info.js';
import type { SearchProviderName } from '../../../shared/search-provider.js';
import {
  alignTtsSpeakerToLocale,
  defaultDesktopServiceSettings,
  desktopSettingsSaveRequestSchema,
  serviceCheckRequestSchema,
  type DesktopTtsVoiceSample,
  type DesktopServiceSettings,
  type ServiceCheckResult,
  type ServiceCheckTarget,
  type DesktopSettingsSaveRequest,
} from '../../../shared/desktop-settings.js';
import {
  globalPushToTalkKeyLabel,
  globalPushToTalkPresetKeys,
  isGlobalPushToTalkKey,
  type GlobalPushToTalkStatus,
} from '../../../shared/global-push-to-talk.js';
import {
  guideSourcesTopic,
  guideToolEventsTopic,
  parseGuideSourcesMessage,
  parseGuideToolEvent,
  type GuideSourcesMessage,
} from '../../../shared/guide-events.js';
import {
  explorePreferencesSchema,
  type ExploreVideoPlatform,
  type ExploreRequest,
} from '../../../shared/explore-contracts.js';
import { defaultExploreVideoPlatforms } from '../../../shared/explore-defaults.js';
import {
  companionPreviewSources,
  type SourceMoreMenuAction,
  type SourceMoreMenuState,
  type SourceWindowState,
} from '../../../shared/source-preview.js';
import { canZoomSourcePageIn, canZoomSourcePageOut } from '../../../shared/source-page-zoom.js';
import {
  guideVoiceAttributes,
  isGuideToolActivity,
  guideVoiceRpc,
  isGuideUserState,
  isVoiceInputMode,
  type GuideVoiceRpcMethod,
  type VoiceInputMode,
} from '../../../shared/voice-control.js';
import {
  msfsReadinessAttributes,
  type MsfsReadinessStatus,
} from '../../../shared/msfs-readiness.js';
import { resolveGuideAvatarExpression } from './avatar-state.js';
import { GuideExpression, GuideFloatingPortrait } from './guide-avatar.js';
import { MessageMarkdown } from './message-markdown.js';
import { createDisplayMessages, shouldAttachSourcePreview } from './session-messages.js';
import alipayQrImage from './assets/about/alipay-qr.jpg';
import wechatQrImage from './assets/about/wechat-qr.png';
import './style.css';

const preferenceStorageKey = 'cloudpath-guide-preferences';

type MenuDirection = 'up' | 'down';
type UtilityDialog = 'settings' | 'quit';
type BrowserDialog = UtilityDialog | 'end-conversation';
type ExploreNoticeKind = 'context' | 'error' | 'configuration';
type ExploreNotice = { kind: ExploreNoticeKind; title: string; description: string };
type SettingsTab = 'general' | 'services' | 'about';
type SupportedLocale = 'zh-CN' | 'en-US';

const visibleGlobalPushToTalkPresetKeys = ['AltLeft', 'F8', 'MouseX1', 'MouseX2'] as const;

const getPushToTalkDisplayKey = (key: string): string => {
  if (key.startsWith('Key')) return key.slice(3);
  if (key.startsWith('Digit')) return key.slice(5);
  return globalPushToTalkKeyLabel(key);
};

type PushToTalkInputDevice = 'keyboard' | 'mouse';

type PushToTalkBindingPickerProps = {
  device: PushToTalkInputDevice;
  english: boolean;
  keyName: string;
  onDeviceChange(device: PushToTalkInputDevice): void;
  onSelect(key: string): void;
  onSelectCustom(): void;
};

const PushToTalkBindingPicker = ({
  device,
  english,
  keyName,
  onDeviceChange,
  onSelect,
  onSelectCustom,
}: PushToTalkBindingPickerProps) => {
  const currentKey = getPushToTalkDisplayKey(keyName);
  return (
    <section
      className="push-to-talk-picker"
      aria-label={english ? 'Global push-to-talk key' : '全局按住说话键'}
    >
      <div className="push-to-talk-picker__header">
        <span>{english ? 'Global push-to-talk key' : '全局按住说话键'}</span>
        <kbd>{currentKey}</kbd>
      </div>
      <div
        className="push-to-talk-device-tabs"
        role="tablist"
        aria-label={english ? 'Input device' : '输入设备'}
      >
        <button
          type="button"
          role="tab"
          aria-selected={device === 'keyboard'}
          className={device === 'keyboard' ? 'is-active' : ''}
          onClick={() => onDeviceChange('keyboard')}
        >
          <KeyboardIcon size={15} weight="duotone" aria-hidden="true" />
          {english ? 'Keyboard' : '键盘'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={device === 'mouse'}
          className={device === 'mouse' ? 'is-active' : ''}
          onClick={() => onDeviceChange('mouse')}
        >
          <span className="push-to-talk-device-tabs__mouse" aria-hidden="true" />
          {english ? 'Mouse' : '鼠标'}
        </button>
      </div>
      {device === 'keyboard' ? (
        <div
          className="push-to-talk-keyboard"
          role="group"
          aria-label={english ? 'Keyboard choices' : '键盘按键选择'}
        >
          <span className="push-to-talk-keyboard__blank">Esc</span>
          <span className="push-to-talk-keyboard__blank">F1</span>
          <span className="push-to-talk-keyboard__blank">F2</span>
          <button
            type="button"
            className={
              keyName === 'F8'
                ? 'push-to-talk-keyboard__key is-active'
                : 'push-to-talk-keyboard__key'
            }
            aria-pressed={keyName === 'F8'}
            onClick={() => onSelect('F8')}
          >
            F8
          </button>
          <span className="push-to-talk-keyboard__blank">F12</span>
          <span className="push-to-talk-keyboard__blank">Q</span>
          <span className="push-to-talk-keyboard__blank">W</span>
          <span className="push-to-talk-keyboard__blank">E</span>
          <span className="push-to-talk-keyboard__blank">R</span>
          <span className="push-to-talk-keyboard__blank">T</span>
          <button
            type="button"
            className={
              keyName === 'AltLeft'
                ? 'push-to-talk-keyboard__key push-to-talk-keyboard__key--alt is-active'
                : 'push-to-talk-keyboard__key push-to-talk-keyboard__key--alt'
            }
            aria-pressed={keyName === 'AltLeft'}
            onClick={() => onSelect('AltLeft')}
          >
            Alt
          </button>
          <span className="push-to-talk-keyboard__blank push-to-talk-keyboard__blank--space">
            Space
          </span>
          <button type="button" className="push-to-talk-keyboard__custom" onClick={onSelectCustom}>
            {english ? 'Custom' : '自定义'}
          </button>
        </div>
      ) : (
        <div
          className="push-to-talk-mouse"
          role="group"
          aria-label={english ? 'Mouse choices' : '鼠标按键选择'}
        >
          <span className="push-to-talk-mouse__wheel" aria-hidden="true" />
          <button
            type="button"
            className={
              keyName === 'MouseX2'
                ? 'push-to-talk-mouse__side push-to-talk-mouse__side--x2 is-active'
                : 'push-to-talk-mouse__side push-to-talk-mouse__side--x2'
            }
            aria-label={english ? 'Mouse X2, forward side button' : '鼠标前进侧键 X2'}
            aria-pressed={keyName === 'MouseX2'}
            title={english ? 'Forward side button (X2)' : '前进侧键（X2）'}
            onClick={() => onSelect('MouseX2')}
          >
            X2
          </button>
          <button
            type="button"
            className={
              keyName === 'MouseX1'
                ? 'push-to-talk-mouse__side push-to-talk-mouse__side--x1 is-active'
                : 'push-to-talk-mouse__side push-to-talk-mouse__side--x1'
            }
            aria-label={english ? 'Mouse X1, back side button' : '鼠标后退侧键 X1'}
            aria-pressed={keyName === 'MouseX1'}
            title={english ? 'Back side button (X1)' : '后退侧键（X1）'}
            onClick={() => onSelect('MouseX1')}
          >
            X1
          </button>
        </div>
      )}
    </section>
  );
};

type Preferences = {
  locale: SupportedLocale;
  alwaysOnTop: boolean;
  agentVolume: number;
  openSourcesInApp: boolean;
  exploreEncyclopedia: 'wikipedia' | 'baidu_baike';
  exploreVideoPlatforms: ExploreVideoPlatform[];
  interfaceMotion: boolean;
  voiceInputMode: VoiceInputMode;
  globalPushToTalkKey: string;
};

const defaultPreferences: Preferences = {
  locale: 'zh-CN',
  alwaysOnTop: true,
  agentVolume: 0.85,
  openSourcesInApp: true,
  exploreEncyclopedia: 'wikipedia',
  exploreVideoPlatforms: defaultExploreVideoPlatforms('zh-CN'),
  interfaceMotion: true,
  voiceInputMode: 'push_to_talk',
  globalPushToTalkKey: 'AltLeft',
};

const readPreferences = (): Preferences => {
  try {
    const saved = localStorage.getItem(preferenceStorageKey);
    if (!saved) return defaultPreferences;
    const raw = JSON.parse(saved) as Record<string, unknown>;
    const parsed = { ...defaultPreferences, ...raw } as Preferences;
    const locale: SupportedLocale = raw.locale === 'en-US' ? 'en-US' : 'zh-CN';
    const savedVideoPlatforms = Array.isArray(raw.exploreVideoPlatforms)
      ? raw.exploreVideoPlatforms.filter(
          (value): value is ExploreVideoPlatform => value === 'youtube' || value === 'bilibili',
        )
      : [];
    return {
      ...parsed,
      agentVolume: Math.min(1, Math.max(0, Number(parsed.agentVolume) || 0)),
      locale,
      voiceInputMode: isVoiceInputMode(parsed.voiceInputMode)
        ? parsed.voiceInputMode
        : defaultPreferences.voiceInputMode,
      globalPushToTalkKey: isGlobalPushToTalkKey(parsed.globalPushToTalkKey)
        ? parsed.globalPushToTalkKey
        : defaultPreferences.globalPushToTalkKey,
      exploreEncyclopedia:
        raw.exploreEncyclopedia === 'baidu_baike'
          ? 'baidu_baike'
          : defaultPreferences.exploreEncyclopedia,
      exploreVideoPlatforms:
        savedVideoPlatforms.length > 0 ? savedVideoPlatforms : defaultExploreVideoPlatforms(locale),
    };
  } catch {
    return defaultPreferences;
  }
};

const usePreferences = () => {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);

  useEffect(() => {
    const syncPreferences = (event: StorageEvent) => {
      if (event.key === preferenceStorageKey) setPreferences(readPreferences());
    };
    window.addEventListener('storage', syncPreferences);
    return () => window.removeEventListener('storage', syncPreferences);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = preferences.interfaceMotion ? 'on' : 'off';
    document.documentElement.lang = preferences.locale;
    void window.desktop?.setAlwaysOnTop(preferences.alwaysOnTop);
  }, [preferences.alwaysOnTop, preferences.interfaceMotion, preferences.locale]);

  const updatePreference = <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem(preferenceStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const savePreferences = (next: Preferences) => {
    localStorage.setItem(preferenceStorageKey, JSON.stringify(next));
    setPreferences(next);
  };

  return { preferences, savePreferences, updatePreference };
};

type ServiceSettings = DesktopServiceSettings;

const customTtsVoiceValue = '__custom__';

type ServiceCredentials = {
  deepseekApiKey: string;
  sttAppId: string;
  sttAccessToken: string;
  ttsAppId: string;
  ttsAccessToken: string;
  searchApiKey: string;
  bochaSearchApiKey: string;
};
type ServiceCredentialStatus = {
  encryptionAvailable: boolean;
  configured: Record<keyof ServiceCredentials, boolean>;
  error?: string;
};
type ServiceTestState = { checking: boolean; result?: ServiceCheckResult };
type SaveState = 'idle' | 'saving' | 'success' | 'error';

const defaultServiceSettings: ServiceSettings = defaultDesktopServiceSettings;

const defaultServiceCredentials: ServiceCredentials = {
  deepseekApiKey: '',
  sttAppId: '',
  sttAccessToken: '',
  ttsAppId: '',
  ttsAccessToken: '',
  searchApiKey: '',
  bochaSearchApiKey: '',
};
const defaultServiceCredentialStatus: ServiceCredentialStatus = {
  encryptionAvailable: false,
  configured: {
    deepseekApiKey: false,
    sttAppId: false,
    sttAccessToken: false,
    ttsAppId: false,
    ttsAccessToken: false,
    searchApiKey: false,
    bochaSearchApiKey: false,
  },
};

type PreferenceRowProps = {
  checked: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  onChange(checked: boolean): void;
};

const PreferenceRow = ({ checked, description, icon, label, onChange }: PreferenceRowProps) => (
  <div className="preference-row">
    <span className="preference-icon" aria-hidden="true">
      {icon}
    </span>
    <span className="preference-copy">
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
    <button
      type="button"
      className="preference-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="preference-switch-thumb">
        {checked ? <CheckIcon size={10} weight="bold" aria-hidden="true" /> : null}
      </span>
    </button>
  </div>
);

type AboutPanelProps = {
  english: boolean;
  info: AboutInfo | null;
  onOpenLink(id: AboutLinkId): void;
};

const AboutPanel = ({ english, info, onOpenLink }: AboutPanelProps) => {
  const productName = info?.productName ?? (english ? 'Xiaoxiao Flight Guide' : '晓晓飞行导游');
  const fallbackSupportChannels: readonly AboutSupportChannel[] = [
    { id: 'wechat', label: english ? 'WeChat' : '微信', qrAsset: 'wechat-qr' },
    { id: 'alipay', label: english ? 'Alipay' : '支付宝', qrAsset: 'alipay-qr' },
  ];
  const supportChannels = info?.supportChannels ?? (window.desktop ? [] : fallbackSupportChannels);
  const qrImages: Record<AboutSupportChannel['qrAsset'], string> = {
    'wechat-qr': wechatQrImage,
    'alipay-qr': alipayQrImage,
  };
  const tutorials = info?.links.filter((link) => link.id === 'tutorial') ?? [];
  const promotions = info?.links.filter((link) => link.id === 'promotion') ?? [];

  return (
    <div className="about-page">
      <section className="about-product" aria-labelledby="about-product-name">
        <span className="about-product-icon" aria-hidden="true">
          <InfoIcon size={21} weight="duotone" />
        </span>
        <span>
          <strong id="about-product-name">{productName}</strong>
          <small>{english ? 'Your companion for every flight' : '陪伴每一段模拟飞行旅程'}</small>
        </span>
      </section>

      <section className="about-section" aria-labelledby="about-software-title">
        <div className="about-section-heading">
          <strong id="about-software-title">{english ? 'Software' : '软件信息'}</strong>
        </div>
        <div className="about-version-row">
          <span>{english ? 'Version' : '版本'}</span>
          <strong>
            {info?.version ?? (english ? 'Available in the desktop app' : '请在桌面应用中查看')}
          </strong>
        </div>
      </section>

      {supportChannels.length > 0 ? (
        <section className="about-section" aria-labelledby="about-support-title">
          <div className="about-section-heading">
            <strong id="about-support-title">{english ? 'Support the project' : '赞赏支持'}</strong>
            <small>
              {english
                ? 'Optional support helps keep this guide improving.'
                : '完全自愿，感谢你愿意支持这个小项目。'}
            </small>
          </div>
          <div className="about-support-grid">
            {supportChannels.map((channel) => (
              <article className="about-support-card" key={channel.id}>
                <img
                  src={qrImages[channel.qrAsset]}
                  alt={
                    english
                      ? `${channel.label} support QR code for ${productName}`
                      : `${productName}${channel.label}赞赏码`
                  }
                />
                <span className="about-support-copy">
                  <span className="about-support-icon" aria-hidden="true">
                    <HeartIcon size={17} weight="fill" />
                  </span>
                  <strong>{channel.label}</strong>
                  <small>
                    {english
                      ? 'Open the app and scan to support the project.'
                      : '打开对应应用扫一扫，支持这个小项目。'}
                  </small>
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tutorials.length > 0 ? (
        <section className="about-section" aria-labelledby="about-tutorial-title">
          <div className="about-section-heading">
            <strong id="about-tutorial-title">{english ? 'Tutorials' : '教程'}</strong>
          </div>
          <div className="about-link-list">
            {tutorials.map((link) => (
              <button key={link.id} type="button" onClick={() => onOpenLink(link.id)}>
                <span>
                  <strong>{link.label}</strong>
                  {link.description ? <small>{link.description}</small> : null}
                </span>
                <span>{link.hostname}</span>
                <ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {promotions.length > 0 ? (
        <section className="about-section" aria-labelledby="about-promotion-title">
          <div className="about-section-heading">
            <strong id="about-promotion-title">
              {english ? 'Promotions and partners' : '推广与合作'}
            </strong>
          </div>
          <div className="about-link-list about-link-list--promotion">
            {promotions.map((link) => (
              <button key={link.id} type="button" onClick={() => onOpenLink(link.id)}>
                <span>
                  <strong>{link.label}</strong>
                  {link.description ? <small>{link.description}</small> : null}
                </span>
                <span>{link.hostname}</span>
                <ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

type SettingsDialogProps = {
  onClose(): void;
  preferences: Preferences;
  savePreferences(next: Preferences): void;
};

const SettingsDialog = ({ onClose, preferences, savePreferences }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [draft, setDraft] = useState<Preferences>(preferences);
  const [services, setServices] = useState<ServiceSettings>(defaultServiceSettings);
  const [credentials, setCredentials] = useState<ServiceCredentials>(defaultServiceCredentials);
  const [credentialUpdates, setCredentialUpdates] = useState<
    DesktopSettingsSaveRequest['credentials']
  >({});
  const [credentialStatus, setCredentialStatus] = useState<ServiceCredentialStatus>(
    defaultServiceCredentialStatus,
  );
  const [serviceTests, setServiceTests] = useState<
    Partial<Record<ServiceCheckTarget, ServiceTestState>>
  >({});
  const [ttsVoiceSamples, setTtsVoiceSamples] = useState<DesktopTtsVoiceSample[]>([]);
  const [ttsVoiceSamplesLoading, setTtsVoiceSamplesLoading] = useState(true);
  const [playingTtsVoiceSpeaker, setPlayingTtsVoiceSpeaker] = useState<string | null>(null);
  const [voiceCredentialsLinked, setVoiceCredentialsLinked] = useState(true);
  const [notice, setNotice] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [diagnosticNotice, setDiagnosticNotice] = useState('');
  const [diagnosticReadiness, setDiagnosticReadiness] = useState<DesktopReadiness | null>(null);
  const [diagnosticExporting, setDiagnosticExporting] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo | null>(null);
  const [globalPushToTalkStatus, setGlobalPushToTalkStatus] =
    useState<GlobalPushToTalkStatus | null>(null);
  const [customKeyMode, setCustomKeyMode] = useState(
    () => !visibleGlobalPushToTalkPresetKeys.includes(preferences.globalPushToTalkKey as never),
  );
  const [pushToTalkDevice, setPushToTalkDevice] = useState<PushToTalkInputDevice>(() =>
    preferences.globalPushToTalkKey.startsWith('Mouse') ? 'mouse' : 'keyboard',
  );
  const ttsPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const saveStateResetTimerRef = useRef<number | null>(null);
  const settingsContentRef = useRef<HTMLElement | null>(null);
  const english = preferences.locale === 'en-US';
  const copy = english
    ? {
        title: 'Preferences',
        subtitle: 'Configure your floating guide',
        general: 'General',
        services: 'Services',
        about: 'About',
        save: 'Save',
        saveReconnect: 'Save and reconnect',
        saved: 'Preferences saved.',
        saving: 'Saving...',
        saveSuccess: 'Saved',
        saveApplied: 'Saved and applied',
        saveFailed: 'Save failed',
      }
    : {
        title: '偏好设置',
        subtitle: '调整悬浮助手的显示方式',
        general: '通用',
        services: '服务配置',
        about: '关于',
        save: '保存',
        saveReconnect: '保存并重新连接',
        saved: '设置已保存。',
        saving: '保存中...',
        saveSuccess: '保存成功',
        saveApplied: '已保存并生效',
        saveFailed: '保存失败',
      };
  const updateDraft = <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    let active = true;
    void Promise.all([
      window.desktop?.getServiceCredentialStatus(),
      window.desktop?.getVisibleLocalServiceCredentials(),
      window.desktop?.getServiceSettings(),
      window.desktop?.getGlobalPushToTalkStatus(),
      window.desktop?.getReadiness(),
    ]).then(([status, localCredentials, serviceSettings, pttStatus, readiness]) => {
      if (!active) return;
      if (status) setCredentialStatus(status as ServiceCredentialStatus);
      if (localCredentials) setCredentials(localCredentials);
      if (serviceSettings) setServices(serviceSettings);
      if (pttStatus) setGlobalPushToTalkStatus(pttStatus);
      if (readiness) setDiagnosticReadiness(readiness);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setTtsVoiceSamplesLoading(true);
    void window.desktop?.getTtsVoiceSamples().then((samples) => {
      if (!active) return;
      setTtsVoiceSamples(samples);
      setTtsVoiceSamplesLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  const stopTtsVoicePreview = useCallback(() => {
    const audio = ttsPreviewAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    ttsPreviewAudioRef.current = null;
    setPlayingTtsVoiceSpeaker(null);
  }, []);
  const playTtsVoicePreview = useCallback(
    (sample: DesktopTtsVoiceSample) => {
      if (playingTtsVoiceSpeaker === sample.speaker) {
        stopTtsVoicePreview();
        return;
      }
      stopTtsVoicePreview();
      const audio = new Audio(sample.dataUrl);
      ttsPreviewAudioRef.current = audio;
      setPlayingTtsVoiceSpeaker(sample.speaker);
      audio.onended = () => {
        if (ttsPreviewAudioRef.current !== audio) return;
        ttsPreviewAudioRef.current = null;
        setPlayingTtsVoiceSpeaker(null);
      };
      audio.onerror = () => {
        if (ttsPreviewAudioRef.current !== audio) return;
        ttsPreviewAudioRef.current = null;
        setPlayingTtsVoiceSpeaker(null);
        setNotice(english ? 'Unable to play this voice sample.' : '无法播放这个音色样例。');
      };
      void audio.play().catch(() => {
        if (ttsPreviewAudioRef.current !== audio) return;
        ttsPreviewAudioRef.current = null;
        setPlayingTtsVoiceSpeaker(null);
        setNotice(english ? 'Unable to play this voice sample.' : '无法播放这个音色样例。');
      });
    },
    [english, playingTtsVoiceSpeaker, stopTtsVoicePreview],
  );
  useEffect(() => stopTtsVoicePreview, [stopTtsVoicePreview]);
  useEffect(
    () => () => {
      if (saveStateResetTimerRef.current !== null) {
        window.clearTimeout(saveStateResetTimerRef.current);
      }
    },
    [],
  );
  useEffect(() => {
    let active = true;
    void window.desktop?.getAboutInfo().then((info) => {
      if (active) setAboutInfo(info ?? null);
    });
    return () => {
      active = false;
    };
  }, []);
  const updateDraftLocale = (locale: SupportedLocale) => {
    updateDraft('locale', locale);
    setServices((current) => ({
      ...current,
      tts: {
        ...current.tts,
        speaker: alignTtsSpeakerToLocale(current.tts.speaker, locale),
      },
    }));
  };
  const saveAllSettings = async (nextPreferences: Preferences): Promise<boolean> => {
    const nextServices: ServiceSettings = {
      ...services,
      tts: {
        ...services.tts,
        speaker: alignTtsSpeakerToLocale(services.tts.speaker, nextPreferences.locale),
      },
    };
    const parsed = desktopSettingsSaveRequestSchema.safeParse({
      locale: nextPreferences.locale,
      services: nextServices,
      credentials: credentialUpdates,
    });
    if (!parsed.success) {
      setNotice(
        english ? 'Check the service endpoint and numeric values.' : '请检查服务地址和数值。',
      );
      return false;
    }
    if (!window.desktop) {
      savePreferences(nextPreferences);
      setServices(nextServices);
      return true;
    }
    const result = await window.desktop.saveSettings(parsed.data);
    if (!result.ok) {
      setNotice(result.readiness.message);
      return false;
    }
    savePreferences(nextPreferences);
    setServices(nextServices);
    setCredentialUpdates({});
    return true;
  };
  const saveGeneral = async (): Promise<boolean> => {
    if (!isGlobalPushToTalkKey(draft.globalPushToTalkKey)) {
      setNotice(
        english
          ? 'Choose one supported global push-to-talk key.'
          : '请选择一个支持的全局按住说话键。',
      );
      return false;
    }
    const localeChanged = draft.locale !== preferences.locale;
    const previousDefaultPlatforms = defaultExploreVideoPlatforms(preferences.locale);
    const keptPreviousDefaultPlatforms =
      draft.exploreVideoPlatforms.length === previousDefaultPlatforms.length &&
      draft.exploreVideoPlatforms.every(
        (platform, index) => platform === previousDefaultPlatforms[index],
      );
    const nextPreferences =
      localeChanged && keptPreviousDefaultPlatforms
        ? {
            ...draft,
            exploreVideoPlatforms: defaultExploreVideoPlatforms(draft.locale),
          }
        : draft;
    if (!localeChanged) {
      savePreferences(nextPreferences);
      return true;
    }
    return saveAllSettings(nextPreferences);
  };
  const saveServices = async (): Promise<boolean> => {
    return saveAllSettings(draft);
  };
  const handleSave = async () => {
    if (saveState === 'saving' || saveState === 'success') return;
    if (saveStateResetTimerRef.current !== null) {
      window.clearTimeout(saveStateResetTimerRef.current);
      saveStateResetTimerRef.current = null;
    }
    setSaveState('saving');
    setNotice('');
    try {
      const succeeded = activeTab === 'general' ? await saveGeneral() : await saveServices();
      if (!succeeded) {
        setSaveState('error');
        return;
      }
      setSaveState('success');
      saveStateResetTimerRef.current = window.setTimeout(() => {
        saveStateResetTimerRef.current = null;
        setSaveState('idle');
      }, 1_500);
    } catch {
      setNotice(english ? 'Unable to save settings. Try again.' : '设置保存失败，请重试。');
      setSaveState('error');
    }
  };
  const exportDiagnostics = async () => {
    if (!window.desktop) return;
    setDiagnosticExporting(true);
    const result = await window.desktop.exportDiagnostics();
    setDiagnosticExporting(false);
    setDiagnosticNotice(result.message);
  };
  const testService = async (target: ServiceCheckTarget) => {
    const parsed = serviceCheckRequestSchema.safeParse({
      target,
      services,
      credentials: credentialUpdates,
    });
    if (!parsed.success) {
      setServiceTests((current) => ({
        ...current,
        [target]: {
          checking: false,
          result: {
            target,
            status: 'unavailable',
            message: english
              ? 'Check this service address and numeric values.'
              : '请检查服务地址和数值。',
          },
        },
      }));
      return;
    }
    setServiceTests((current) => ({ ...current, [target]: { checking: true } }));
    const result = await window.desktop?.testService(parsed.data);
    setServiceTests((current) => ({
      ...current,
      [target]: {
        checking: false,
        result: result ?? {
          target,
          status: 'unavailable',
          message: english ? 'The desktop service check is unavailable.' : '桌面端服务检测不可用。',
        },
      },
    }));
  };
  const updateCredential = <Key extends keyof ServiceCredentials>(
    key: Key,
    value: ServiceCredentials[Key],
  ) => {
    setCredentials((current) => {
      if (voiceCredentialsLinked && key === 'sttAppId') {
        setCredentialUpdates((updates) => ({ ...updates, sttAppId: value, ttsAppId: value }));
        return { ...current, sttAppId: value, ttsAppId: value };
      }
      if (voiceCredentialsLinked && key === 'sttAccessToken') {
        setCredentialUpdates((updates) => ({
          ...updates,
          sttAccessToken: value,
          ttsAccessToken: value,
        }));
        return { ...current, sttAccessToken: value, ttsAccessToken: value };
      }
      setCredentialUpdates((updates) => ({ ...updates, [key]: value }));
      return { ...current, [key]: value };
    });
  };
  const toggleVoiceCredentialsLink = () => {
    setVoiceCredentialsLinked((linked) => {
      if (!linked) {
        setCredentials((current) => ({
          ...current,
          ttsAppId: current.sttAppId,
          ttsAccessToken: current.sttAccessToken,
        }));
      }
      return !linked;
    });
  };
  const selectSettingsTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => settingsContentRef.current?.scrollTo({ top: 0 }));
  };
  const openAboutLink = (id: AboutLinkId) => {
    void window.desktop?.openAboutLink(id);
  };
  const captureCustomPushToTalkKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (
      !isGlobalPushToTalkKey(event.code) ||
      globalPushToTalkPresetKeys.includes(event.code as never)
    ) {
      setNotice(
        english
          ? 'Use one non-modifier keyboard key. Right Alt, Ctrl, Shift and Windows keys are unavailable.'
          : '请输入一个非修饰键。右 Alt、Ctrl、Shift 和 Windows 键不可用。',
      );
      return;
    }
    setNotice('');
    updateDraft('globalPushToTalkKey', event.code);
  };
  const deepseekConfigured =
    credentialStatus.configured.deepseekApiKey || credentials.deepseekApiKey;
  const voiceConfigured =
    (credentialStatus.configured.sttAppId || credentials.sttAppId) &&
    (credentialStatus.configured.sttAccessToken || credentials.sttAccessToken);
  const searchCredentialKey: 'searchApiKey' | 'bochaSearchApiKey' =
    services.search.provider === 'bocha' ? 'bochaSearchApiKey' : 'searchApiKey';
  const searchConfigured =
    credentialStatus.configured[searchCredentialKey] || credentials[searchCredentialKey];
  const ttsVoiceOptions = ttsVoiceSamples.filter((voice) => voice.locale === draft.locale);
  const selectedTtsVoiceSample = ttsVoiceOptions.find(
    (voice) => voice.speaker === services.tts.speaker,
  );
  const isKnownTtsVoice = selectedTtsVoiceSample !== undefined;
  const ttsVoiceSelectValue = isKnownTtsVoice ? services.tts.speaker : customTtsVoiceValue;

  return (
    <main className="utility-card settings-dialog" role="dialog" aria-modal="true">
      <header className="utility-header drag-region">
        <span className="utility-heading-icon" aria-hidden="true">
          <GearSixIcon size={18} weight="duotone" />
        </span>
        <span>
          <strong>{copy.title}</strong>
          <small>{copy.subtitle}</small>
        </span>
        <button
          type="button"
          className="utility-close no-drag"
          aria-label="关闭设置"
          title="关闭"
          onClick={onClose}
        >
          <XIcon size={16} weight="bold" aria-hidden="true" />
        </button>
      </header>
      <div className="settings-body">
        <nav
          className="settings-navigation no-drag"
          aria-label={english ? 'Settings pages' : '设置页面'}
        >
          <button
            type="button"
            className={
              activeTab === 'general' ? 'settings-nav-item is-active' : 'settings-nav-item'
            }
            onClick={() => selectSettingsTab('general')}
          >
            <GearSixIcon size={17} weight="duotone" aria-hidden="true" />
            <span>{copy.general}</span>
          </button>
          <button
            type="button"
            className={
              activeTab === 'services' ? 'settings-nav-item is-active' : 'settings-nav-item'
            }
            onClick={() => selectSettingsTab('services')}
          >
            <WaveformIcon size={17} weight="duotone" aria-hidden="true" />
            <span>{copy.services}</span>
          </button>
          <button
            type="button"
            className={activeTab === 'about' ? 'settings-nav-item is-active' : 'settings-nav-item'}
            onClick={() => selectSettingsTab('about')}
          >
            <InfoIcon size={17} weight="duotone" aria-hidden="true" />
            <span>{copy.about}</span>
          </button>
        </nav>
        <section
          ref={settingsContentRef}
          className="settings-content"
          aria-label={
            activeTab === 'general'
              ? copy.general
              : activeTab === 'services'
                ? copy.services
                : copy.about
          }
        >
          {activeTab === 'general' ? (
            <>
              <div className="settings-section-heading">
                <strong>{english ? 'Language' : '语言'}</strong>
                <small>
                  {english ? 'Apply the interface language after saving.' : '保存后应用界面语言。'}
                </small>
              </div>
              <label className="settings-select-row">
                <span>{english ? 'Project language' : '项目语言'}</span>
                <select
                  value={draft.locale}
                  onChange={(event) => updateDraftLocale(event.target.value as SupportedLocale)}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </label>
              <div className="settings-section-heading">
                <strong>{english ? 'Flight experience' : '飞行体验'}</strong>
              </div>
              <PreferenceRow
                checked={draft.alwaysOnTop}
                description={
                  english
                    ? 'Keep the guide above other windows while flying'
                    : '飞行时让助手保持在其他窗口上方'
                }
                icon={<PushPinIcon size={18} weight="duotone" />}
                label={english ? 'Always on top' : '始终置顶'}
                onChange={(checked) => updateDraft('alwaysOnTop', checked)}
              />
              <div className="preference-row preference-row--volume">
                <span className="preference-icon" aria-hidden="true">
                  <SpeakerHighIcon size={18} weight="duotone" />
                </span>
                <span className="preference-copy">
                  <strong>{english ? 'Response volume' : '回答音量'}</strong>
                  <small>{Math.round(draft.agentVolume * 100)}%</small>
                </span>
                <input
                  className="volume-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(draft.agentVolume * 100)}
                  aria-label={english ? 'Response volume' : '回答音量'}
                  onChange={(event) => updateDraft('agentVolume', Number(event.target.value) / 100)}
                />
              </div>
              <PreferenceRow
                checked={draft.interfaceMotion}
                description={
                  english
                    ? 'Keep subtle menu and status animations'
                    : '保留菜单弹出和状态切换的轻微动效'
                }
                icon={<SparkleIcon size={18} weight="duotone" />}
                label={english ? 'Interface motion' : '界面动效'}
                onChange={(checked) => updateDraft('interfaceMotion', checked)}
              />
              <div className="settings-section-heading">
                <strong>{english ? 'Source browsing' : '来源浏览'}</strong>
              </div>
              <PreferenceRow
                checked={draft.openSourcesInApp}
                description={
                  english
                    ? 'Open cited web pages in the companion window'
                    : '使用伴随窗口查看回答引用的网页'
                }
                icon={<BrowserIcon size={18} weight="duotone" />}
                label={english ? 'Open sources in app' : '应用内打开来源'}
                onChange={(checked) => updateDraft('openSourcesInApp', checked)}
              />
              <div className="settings-section-heading">
                <strong>{english ? 'Explore sources' : '探索来源'}</strong>
              </div>
              <label className="settings-select-row">
                <span>{english ? 'Encyclopedia' : '百科来源'}</span>
                <select
                  value={draft.exploreEncyclopedia}
                  onChange={(event) =>
                    updateDraft(
                      'exploreEncyclopedia',
                      event.target.value as Preferences['exploreEncyclopedia'],
                    )
                  }
                >
                  <option value="wikipedia">Wikipedia</option>
                  <option value="baidu_baike">{english ? 'Baidu Baike' : '百度百科'}</option>
                </select>
              </label>
              <div
                className="explore-platform-settings"
                role="group"
                aria-label={english ? 'Video platforms' : '视频来源'}
              >
                <span>{english ? 'Video platforms' : '视频来源'}</span>
                {(['youtube', 'bilibili'] as const).map((platform) => (
                  <label key={platform}>
                    <input
                      type="checkbox"
                      checked={draft.exploreVideoPlatforms.includes(platform)}
                      onChange={(event) =>
                        updateDraft(
                          'exploreVideoPlatforms',
                          event.target.checked
                            ? [...new Set([...draft.exploreVideoPlatforms, platform])]
                            : draft.exploreVideoPlatforms.filter((value) => value !== platform),
                        )
                      }
                    />
                    {platform === 'youtube' ? 'YouTube' : english ? 'Bilibili' : '哔哩哔哩'}
                  </label>
                ))}
              </div>
              <div className="settings-section-heading">
                <strong>{english ? 'Voice input' : '语音输入'}</strong>
              </div>
              <PushToTalkBindingPicker
                device={pushToTalkDevice}
                english={english}
                keyName={draft.globalPushToTalkKey}
                onDeviceChange={setPushToTalkDevice}
                onSelect={(key) => {
                  setCustomKeyMode(false);
                  setPushToTalkDevice(key.startsWith('Mouse') ? 'mouse' : 'keyboard');
                  updateDraft('globalPushToTalkKey', key);
                }}
                onSelectCustom={() => {
                  setPushToTalkDevice('keyboard');
                  setCustomKeyMode(true);
                }}
              />
              {customKeyMode ? (
                <label className="settings-select-row">
                  <span>{english ? 'Custom keyboard key' : '自定义键盘按键'}</span>
                  <input
                    readOnly
                    value={
                      globalPushToTalkPresetKeys.includes(draft.globalPushToTalkKey as never)
                        ? ''
                        : globalPushToTalkKeyLabel(draft.globalPushToTalkKey)
                    }
                    placeholder={english ? 'Press one key' : '按下一个按键'}
                    aria-label={english ? 'Custom global push-to-talk key' : '自定义全局按住说话键'}
                    onKeyDown={captureCustomPushToTalkKey}
                  />
                </label>
              ) : null}
              {globalPushToTalkStatus && !globalPushToTalkStatus.available ? (
                <p className="settings-inline-notice" role="status">
                  {globalPushToTalkStatus.message}
                </p>
              ) : null}
              <div className="settings-section-heading">
                <strong>{english ? 'Diagnostics & support' : '诊断与支持'}</strong>
              </div>
              <div className="diagnostics-row">
                <span>
                  <strong>{english ? 'Guide service' : '导游服务'}</strong>
                  <small>
                    {diagnosticNotice ||
                      diagnosticReadiness?.message ||
                      (english ? 'Checking guide service…' : '正在检查导游服务…')}
                  </small>
                </span>
                <button
                  type="button"
                  className="secondary-settings-button"
                  disabled={diagnosticExporting}
                  onClick={() => void exportDiagnostics()}
                >
                  {diagnosticExporting
                    ? english
                      ? 'Exporting…'
                      : '正在导出…'
                    : english
                      ? 'Export diagnostic package'
                      : '导出诊断包'}
                </button>
              </div>
            </>
          ) : activeTab === 'services' ? (
            <>
              <div className="settings-section-heading">
                <strong>{english ? 'Service configuration' : '服务配置'}</strong>
                <small>
                  {english
                    ? 'Set up the three services your guide needs. Search provider settings are kept simple.'
                    : '只需完成导游真正需要的三项服务；搜索服务只需选择服务商并填写 Key。'}
                </small>
              </div>
              <div className="service-progress" role="status">
                <span>{english ? 'Setup status' : '配置状态'}</span>
                <div>
                  <ServiceStatus configured={Boolean(deepseekConfigured)} label="DeepSeek" />
                  <ServiceStatus
                    configured={Boolean(voiceConfigured)}
                    label={english ? 'Voice' : '豆包语音'}
                  />
                  <ServiceStatus
                    configured={Boolean(searchConfigured)}
                    label={english ? 'Search (optional)' : '网页搜索（可选）'}
                  />
                </div>
              </div>
              <ServiceGroup
                action={
                  <ServiceTestControl
                    english={english}
                    onTest={() => void testService('llm')}
                    state={serviceTests.llm}
                  />
                }
                description={
                  english ? 'Required for the guide to answer you.' : '导游回答问题所需的核心服务。'
                }
                title="DeepSeek"
              >
                <ServiceField
                  label="API Key"
                  configured={credentialStatus.configured.deepseekApiKey}
                  type="password"
                  value={credentials.deepseekApiKey}
                  onChange={(value) => updateCredential('deepseekApiKey', value)}
                />
                <details className="service-advanced no-drag">
                  <summary>{english ? 'Advanced settings' : '高级设置'}</summary>
                  <ServiceField
                    label={english ? 'Base URL' : 'Base URL'}
                    value={services.llm.baseUrl}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        llm: { ...current.llm, baseUrl: value },
                      }))
                    }
                  />
                  <ServiceField
                    label={english ? 'Model' : '模型'}
                    value={services.llm.model}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        llm: { ...current.llm, model: value },
                      }))
                    }
                  />
                </details>
              </ServiceGroup>
              <ServiceGroup
                description={
                  english
                    ? 'Speech recognition and voice playback use your Volcengine account.'
                    : '语音识别与播报均使用你的豆包账号。'
                }
                title={english ? 'Volcengine voice' : '豆包语音'}
              >
                <div className="service-subsection-heading">
                  <strong className="service-subheading">STT</strong>
                  <ServiceTestControl
                    english={english}
                    onTest={() => void testService('stt')}
                    state={serviceTests.stt}
                  />
                </div>
                <ServiceField
                  label={english ? 'Volcengine App ID' : '豆包 App ID'}
                  configured={credentialStatus.configured.sttAppId}
                  type="password"
                  value={credentials.sttAppId}
                  onChange={(value) => updateCredential('sttAppId', value)}
                />
                <ServiceField
                  label={english ? 'Volcengine Access Token' : '豆包 Access Token'}
                  configured={credentialStatus.configured.sttAccessToken}
                  type="password"
                  value={credentials.sttAccessToken}
                  onChange={(value) => updateCredential('sttAccessToken', value)}
                />
                <details className="service-advanced no-drag">
                  <summary>{english ? 'STT advanced settings' : 'STT 高级设置'}</summary>
                  <ServiceField
                    label="WebSocket endpoint"
                    value={services.stt.endpoint}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        stt: { ...current.stt, endpoint: value },
                      }))
                    }
                  />
                  <ServiceField
                    label={english ? 'Resource ID' : '资源 ID'}
                    value={services.stt.resourceId}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        stt: { ...current.stt, resourceId: value },
                      }))
                    }
                  />
                  <ServiceField
                    label={english ? 'Model' : '模型'}
                    value={services.stt.model}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        stt: { ...current.stt, model: value },
                      }))
                    }
                  />
                </details>
                <button
                  type="button"
                  className="credentials-link-toggle no-drag"
                  role="switch"
                  aria-checked={voiceCredentialsLinked}
                  onClick={toggleVoiceCredentialsLink}
                >
                  <span>
                    <strong>
                      {english ? 'Use the same credentials for TTS' : 'TTS 使用同一套凭据'}
                    </strong>
                    <small>
                      {voiceCredentialsLinked
                        ? english
                          ? 'On by default. TTS will use the App ID and Access Token above.'
                          : '默认开启。TTS 将使用上方的 App ID 与 Access Token。'
                        : english
                          ? 'Off. You can enter separate credentials for TTS below.'
                          : '已关闭。现在可在下方填写独立的 TTS 凭据。'}
                    </small>
                  </span>
                  <span className="preference-switch" aria-hidden="true">
                    <span className="preference-switch-thumb">
                      {voiceCredentialsLinked ? <CheckIcon size={10} weight="bold" /> : null}
                    </span>
                  </span>
                </button>
                <div className="service-subsection-heading">
                  <strong className="service-subheading">TTS</strong>
                  <ServiceTestControl
                    english={english}
                    onTest={() => void testService('tts')}
                    state={serviceTests.tts}
                  />
                </div>
                {voiceCredentialsLinked ? (
                  <div className="linked-credentials-note credential-state" key="linked">
                    {english
                      ? 'TTS is using the STT App ID and Access Token.'
                      : 'TTS 正在使用 STT 的 App ID 与 Access Token。'}
                  </div>
                ) : (
                  <div className="service-nested-fields credential-state" key="separate">
                    <ServiceField
                      label={english ? 'Volcengine App ID' : '豆包 App ID'}
                      configured={credentialStatus.configured.ttsAppId}
                      type="password"
                      value={credentials.ttsAppId}
                      onChange={(value) => updateCredential('ttsAppId', value)}
                    />
                    <ServiceField
                      label={english ? 'Volcengine Access Token' : '豆包 Access Token'}
                      configured={credentialStatus.configured.ttsAccessToken}
                      type="password"
                      value={credentials.ttsAccessToken}
                      onChange={(value) => updateCredential('ttsAccessToken', value)}
                    />
                  </div>
                )}
                <div className="tts-voice-picker">
                  <div className="tts-voice-picker-row">
                    <TtsVoiceSelectField
                      label={english ? 'TTS voice' : '豆包 TTS 音色'}
                      value={ttsVoiceSelectValue}
                      voices={ttsVoiceOptions}
                      customLabel={english ? 'Custom speaker ID' : '自定义 speaker ID'}
                      customValue={customTtsVoiceValue}
                      onChange={(value) =>
                        setServices((current) => ({
                          ...current,
                          tts: {
                            ...current.tts,
                            speaker: value === customTtsVoiceValue ? '' : value,
                          },
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="tts-voice-preview-button no-drag"
                      disabled={!selectedTtsVoiceSample}
                      aria-label={
                        playingTtsVoiceSpeaker === selectedTtsVoiceSample?.speaker
                          ? english
                            ? 'Stop voice preview'
                            : '停止试听'
                          : english
                            ? 'Play voice preview'
                            : '播放音色试听'
                      }
                      title={
                        playingTtsVoiceSpeaker === selectedTtsVoiceSample?.speaker
                          ? english
                            ? 'Stop voice preview'
                            : '停止试听'
                          : english
                            ? 'Play voice preview'
                            : '播放音色试听'
                      }
                      onClick={() =>
                        selectedTtsVoiceSample && playTtsVoicePreview(selectedTtsVoiceSample)
                      }
                    >
                      {playingTtsVoiceSpeaker === selectedTtsVoiceSample?.speaker ? (
                        <StopIcon size={14} weight="bold" aria-hidden="true" />
                      ) : (
                        <SpeakerHighIcon size={14} weight="bold" aria-hidden="true" />
                      )}
                      <span>
                        {playingTtsVoiceSpeaker === selectedTtsVoiceSample?.speaker
                          ? english
                            ? 'Stop'
                            : '停止'
                          : english
                            ? 'Preview'
                            : '试听'}
                      </span>
                    </button>
                  </div>
                  <small className="tts-voice-picker-note">
                    {ttsVoiceSamplesLoading
                      ? english
                        ? 'Loading voice samples from the Confirmed Voices folder…'
                        : '正在读取“确认音色”文件夹…'
                      : ttsVoiceOptions.length === 0
                        ? english
                          ? 'No voice sample matches the project language. Use a custom speaker ID below.'
                          : '没有匹配项目语言的音色样例，请在下方填写自定义 speaker ID。'
                        : english
                          ? `${ttsVoiceOptions.length} local voice sample${ttsVoiceOptions.length === 1 ? '' : 's'} available.`
                          : `已读取 ${ttsVoiceOptions.length} 个本地音色样例。`}
                  </small>
                </div>
                {!isKnownTtsVoice ? (
                  <ServiceField
                    label={english ? 'Custom speaker ID' : '自定义 speaker ID'}
                    value={services.tts.speaker}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        tts: { ...current.tts, speaker: value },
                      }))
                    }
                  />
                ) : null}
                <details className="service-advanced no-drag">
                  <summary>{english ? 'TTS advanced settings' : 'TTS 高级设置'}</summary>
                  <ServiceField
                    label="WebSocket endpoint"
                    value={services.tts.endpoint}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        tts: { ...current.tts, endpoint: value },
                      }))
                    }
                  />
                  <ServiceField
                    label={english ? 'Resource ID' : '资源 ID'}
                    value={services.tts.resourceId}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        tts: { ...current.tts, resourceId: value },
                      }))
                    }
                  />
                  <ServiceField
                    label={english ? 'Sample rate' : '采样率'}
                    type="number"
                    value={String(services.tts.sampleRate)}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        tts: { ...current.tts, sampleRate: Number(value) },
                      }))
                    }
                  />
                </details>
              </ServiceGroup>
              <ServiceGroup
                action={
                  <ServiceTestControl
                    english={english}
                    onTest={() => void testService('search')}
                    state={serviceTests.search}
                  />
                }
                description={
                  english
                    ? 'Optional. Enables up-to-date web answers and source links.'
                    : '可选。配置后才能联网检索并返回来源链接。'
                }
                title={english ? 'Web search' : '网页搜索'}
              >
                <label className="service-field">
                  <span>{english ? 'Provider' : '服务商'}</span>
                  <span className="service-field-control service-field-control--select">
                    <select
                      value={services.search.provider}
                      onChange={(event) => {
                        const provider = event.target.value as SearchProviderName;
                        setServices((current) => ({ ...current, search: { provider } }));
                        setServiceTests((current) => {
                          const next = { ...current };
                          delete next.search;
                          return next;
                        });
                      }}
                    >
                      <option value="volcengine">{english ? 'Volcengine' : '豆包搜索'}</option>
                      <option value="bocha">{english ? 'Bocha' : '博查搜索'}</option>
                    </select>
                    <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                  </span>
                </label>
                <ServiceField
                  label={english ? 'API Key (optional)' : 'API Key（可选）'}
                  configured={credentialStatus.configured[searchCredentialKey]}
                  type="password"
                  value={credentials[searchCredentialKey]}
                  onChange={(value) => updateCredential(searchCredentialKey, value)}
                />
              </ServiceGroup>
            </>
          ) : (
            <AboutPanel english={english} info={aboutInfo} onOpenLink={openAboutLink} />
          )}
        </section>
      </div>
      {activeTab === 'about' ? null : (
        <footer className="settings-footer">
          <span role="status">
            {(saveState === 'success'
              ? copy.saved
              : saveState === 'error' && !notice
                ? copy.saveFailed
                : notice) ||
              (activeTab === 'general'
                ? english
                  ? 'Changes are saved when you press Save.'
                  : '修改将在点击保存后生效。'
                : english
                  ? 'Changing a service will reconnect the guide.'
                  : '保存服务配置后将重新连接导游。')}
          </span>
          <button
            type="button"
            className={`done-button no-drag done-button--${saveState}`}
            aria-busy={saveState === 'saving'}
            disabled={saveState === 'saving' || saveState === 'success'}
            onClick={() => void handleSave()}
          >
            {saveState === 'saving' ? (
              <CircleNotchIcon className="done-button-spinner" size={14} aria-hidden="true" />
            ) : saveState === 'success' ? (
              <CheckIcon size={14} weight="bold" aria-hidden="true" />
            ) : saveState === 'error' ? (
              <WarningCircleIcon size={14} weight="bold" aria-hidden="true" />
            ) : null}
            <span>
              {saveState === 'saving'
                ? copy.saving
                : saveState === 'success'
                  ? activeTab === 'general'
                    ? copy.saveSuccess
                    : copy.saveApplied
                  : saveState === 'error'
                    ? copy.saveFailed
                    : activeTab === 'general'
                      ? copy.save
                      : copy.saveReconnect}
            </span>
          </button>
        </footer>
      )}
    </main>
  );
};

const ServiceGroup = ({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}) => (
  <section className="service-group">
    <header className="service-group-header">
      <span className="service-group-title-row">
        <strong>{title}</strong>
        {action}
      </span>
      <small>{description}</small>
    </header>
    {children}
  </section>
);
const ServiceStatus = ({ configured, label }: { configured: boolean; label: string }) => (
  <span className={configured ? 'service-status is-ready' : 'service-status'}>
    <i aria-hidden="true" />
    {label}
  </span>
);
const ServiceTestControl = ({
  english,
  onTest,
  state,
}: {
  english: boolean;
  onTest(): void;
  state: ServiceTestState | undefined;
}) => {
  const result = state?.result;
  const available = result?.status === 'available';
  const statusLabel = state?.checking
    ? english
      ? 'Testing'
      : '检测中'
    : available
      ? english
        ? 'Available'
        : '可用'
      : english
        ? 'Test'
        : '检测';
  return (
    <span className="service-test-control">
      <button
        type="button"
        className={
          available ? 'service-test-button no-drag is-available' : 'service-test-button no-drag'
        }
        disabled={state?.checking}
        onClick={onTest}
      >
        {state?.checking ? (
          <CircleNotchIcon className="service-test-spinner" size={13} aria-hidden="true" />
        ) : available ? (
          <CheckIcon size={13} weight="bold" aria-hidden="true" />
        ) : (
          <MagnifyingGlassIcon size={13} weight="bold" aria-hidden="true" />
        )}
        <span>{statusLabel}</span>
      </button>
      {result ? (
        <small
          className={
            result.status === 'available'
              ? 'service-test-result is-available'
              : 'service-test-result is-unavailable'
          }
          role="status"
        >
          {result.message}
          {result.latencyMs !== undefined ? ` · ${result.latencyMs} ms` : ''}
        </small>
      ) : null}
    </span>
  );
};
const ServiceField = ({
  configured = false,
  disabled = false,
  label,
  onChange,
  type = 'text',
  value,
}: {
  label: string;
  onChange(value: string): void;
  configured?: boolean;
  disabled?: boolean;
  type?: 'number' | 'password' | 'text';
  value: string;
}) => {
  const [revealed, setRevealed] = useState(false);
  const isSecret = type === 'password';
  return (
    <label className="service-field">
      <span>{label}</span>
      <span className="service-field-control">
        <input
          disabled={disabled}
          placeholder={configured && !value ? '已配置' : undefined}
          type={isSecret && !revealed ? 'password' : 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {isSecret ? (
          <button
            type="button"
            className={
              revealed
                ? 'credential-visibility-toggle no-drag is-revealed'
                : 'credential-visibility-toggle no-drag'
            }
            aria-label={revealed ? `隐藏 ${label}` : `显示 ${label}`}
            aria-pressed={revealed}
            title={revealed ? '隐藏内容' : '显示内容'}
            disabled={disabled || value.length === 0}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? (
              <EyeClosedIcon size={15} aria-hidden="true" />
            ) : (
              <EyeIcon size={15} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </span>
    </label>
  );
};

const TtsVoiceSelectField = ({
  customLabel,
  customValue,
  label,
  onChange,
  value,
  voices,
}: {
  customLabel: string;
  customValue: string;
  label: string;
  onChange(value: string): void;
  value: string;
  voices: ReadonlyArray<DesktopTtsVoiceSample>;
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedVoice = voices.find((voice) => voice.speaker === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const chooseVoice = (speaker: string) => {
    onChange(speaker);
    setOpen(false);
  };

  return (
    <div className="service-field tts-voice-select-field" ref={rootRef}>
      <span>{label}</span>
      <div className="tts-voice-select-control">
        <button
          type="button"
          className="tts-voice-select-trigger no-drag"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selectedVoice?.name ?? customLabel}</span>
          <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
        </button>
        {open ? (
          <div className="tts-voice-select-menu" role="listbox" aria-label={label}>
            {voices.map((voice) => (
              <button
                key={voice.speaker}
                type="button"
                className="tts-voice-select-option no-drag"
                role="option"
                aria-selected={voice.speaker === value}
                onClick={() => chooseVoice(voice.speaker)}
              >
                <span>
                  <strong>{voice.name}</strong>
                  <small>{voice.speaker}</small>
                </span>
                {voice.speaker === value ? <CheckIcon size={14} weight="bold" /> : null}
              </button>
            ))}
            <button
              type="button"
              className="tts-voice-select-option no-drag"
              role="option"
              aria-selected={value === customValue}
              onClick={() => chooseVoice(customValue)}
            >
              <span>
                <strong>{customLabel}</strong>
                <small>手动填写 speaker ID</small>
              </span>
              {value === customValue ? <CheckIcon size={14} weight="bold" /> : null}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

type QuitDialogProps = {
  onClose(): void;
};

const QuitDialog = ({ onClose }: QuitDialogProps) => {
  const confirmQuit = async () => {
    if (window.desktop) await window.desktop.quitApp();
    else onClose();
  };

  return (
    <main className="utility-card quit-dialog" role="alertdialog" aria-modal="true">
      <header className="quit-header drag-region">
        <span className="quit-icon" aria-hidden="true">
          <PowerIcon size={22} weight="duotone" />
        </span>
        <button
          type="button"
          className="utility-close no-drag"
          aria-label="关闭退出确认"
          title="关闭"
          onClick={onClose}
        >
          <XIcon size={16} weight="bold" aria-hidden="true" />
        </button>
      </header>
      <section className="quit-copy">
        <h1>退出云迹导游？</h1>
        <p>当前语音连接和来源窗口将会关闭。</p>
      </section>
      <footer className="quit-actions">
        <button type="button" className="cancel-button" onClick={onClose}>
          取消
        </button>
        <button type="button" className="quit-button" onClick={() => void confirmQuit()}>
          退出应用
        </button>
      </footer>
    </main>
  );
};

type EndConversationDialogProps = {
  closing: boolean;
  english: boolean;
  onClose(): void;
  onConfirm(): void;
};

const EndConversationDialog = ({
  closing,
  english,
  onClose,
  onConfirm,
}: EndConversationDialogProps) => (
  <main className="utility-card quit-dialog" role="alertdialog" aria-modal="true">
    <header className="quit-header drag-region">
      <span className="quit-icon" aria-hidden="true">
        <XIcon size={22} weight="duotone" />
      </span>
      <button
        type="button"
        className="utility-close no-drag"
        aria-label={english ? 'Close confirmation' : '关闭确认'}
        title={english ? 'Close' : '关闭'}
        disabled={closing}
        onClick={onClose}
      >
        <XIcon size={16} weight="bold" aria-hidden="true" />
      </button>
    </header>
    <section className="quit-copy">
      <h1>{english ? 'End this conversation?' : '结束当前对话？'}</h1>
      <p>
        {english
          ? 'The current conversation and source preview will be cleared. The app will remain available from the floating portrait.'
          : '当前对话与来源预览将被清空，应用仍可从悬浮球继续使用。'}
      </p>
    </section>
    <footer className="quit-actions">
      <button type="button" className="cancel-button" disabled={closing} onClick={onClose}>
        {english ? 'Keep talking' : '继续对话'}
      </button>
      <button type="button" className="quit-button" disabled={closing} onClick={onConfirm}>
        {closing ? (english ? 'Closing…' : '正在关闭…') : english ? 'End and close' : '结束并关闭'}
      </button>
    </footer>
  </main>
);

type AssistantViewProps = {
  endSession(): Promise<void>;
  onVoiceChannelChange(connected: boolean): void;
  preferences: Preferences;
  readiness: DesktopReadiness | null;
  retry(): Promise<boolean>;
  session: UseSessionReturn;
  savePreferences(next: Preferences): void;
  starting: boolean;
  startupError: string;
  updatePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void;
  voiceChannelConnected: boolean;
};

const maximumTextMessageLength = 4000;

const Assistant = () => {
  const { preferences, savePreferences, updatePreference } = usePreferences();
  const [readiness, setReadiness] = useState<DesktopReadiness | null>(null);
  const [starting, setStarting] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [voiceChannelConnected, setVoiceChannelConnected] = useState(true);
  const connectAbortRef = useRef<AbortController | null>(null);

  useEffect(() => window.desktop?.onLocaleChanged(() => window.location.reload()), []);

  const tokenSource = useMemo(
    () =>
      TokenSource.literal(async () => {
        const result = await window.desktop?.createLiveKitSession();
        if (!result) throw new Error('桌面端连接接口不可用');
        if (!result.ok) {
          setReadiness(result.readiness);
          throw new Error(result.readiness.message);
        }
        setReadiness(null);
        return {
          participantToken: result.credentials.token,
          serverUrl: result.credentials.serverUrl,
        };
      }),
    [],
  );
  const session = useSession(tokenSource, { agentConnectTimeoutMilliseconds: 30_000 });
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const startSession = useCallback(async () => {
    connectAbortRef.current?.abort();
    const controller = new AbortController();
    connectAbortRef.current = controller;
    setStarting(true);
    setStartupError('');
    try {
      const current = sessionRef.current;
      if (current.connectionState !== ConnectionState.Disconnected) await current.end();
      await current.start({
        signal: controller.signal,
        tracks: { microphone: { enabled: false } },
      });
      return true;
    } catch (error) {
      if (!controller.signal.aborted) {
        setStartupError(error instanceof Error ? error.message : '语音服务连接失败');
      }
      return false;
    } finally {
      if (!controller.signal.aborted) setStarting(false);
    }
  }, []);

  const endSession = useCallback(async () => {
    connectAbortRef.current?.abort();
    await sessionRef.current.end();
  }, []);

  useEffect(() => {
    void startSession();
    return () => {
      connectAbortRef.current?.abort();
      void sessionRef.current.end();
    };
  }, [startSession]);

  return (
    <SessionProvider session={session}>
      <RoomAudioRenderer volume={voiceChannelConnected ? preferences.agentVolume : 0} />
      <AssistantView
        endSession={endSession}
        onVoiceChannelChange={setVoiceChannelConnected}
        preferences={preferences}
        readiness={readiness}
        retry={startSession}
        session={session}
        savePreferences={savePreferences}
        starting={starting}
        startupError={startupError}
        updatePreference={updatePreference}
        voiceChannelConnected={voiceChannelConnected}
      />
    </SessionProvider>
  );
};

const AssistantView = ({
  endSession,
  onVoiceChannelChange,
  preferences,
  readiness,
  retry,
  session,
  savePreferences,
  starting,
  startupError,
  updatePreference,
  voiceChannelConnected,
}: AssistantViewProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDirection, setMenuDirection] = useState<MenuDirection>('down');
  const [browserDialog, setBrowserDialog] = useState<BrowserDialog | null>(null);
  const [voiceTransitioning, setVoiceTransitioning] = useState(false);
  const [controlError, setControlError] = useState('');
  const [microphoneError, setMicrophoneError] = useState('');
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textInputError, setTextInputError] = useState('');
  const [exploring, setExploring] = useState(false);
  const [exploreNotice, setExploreNotice] = useState<ExploreNotice | null>(null);
  const [closingConversation, setClosingConversation] = useState(false);
  const [voiceModeMenuOpen, setVoiceModeMenuOpen] = useState(false);
  const [usedToolsInTurn, setUsedToolsInTurn] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [sourcesByMessage, setSourcesByMessage] = useState<Record<string, GuideSourcesMessage>>({});
  const [pendingSources, setPendingSources] = useState<{
    preview: GuideSourcesMessage;
    anchorMessageId: string | null;
    anchorMessageText: string;
    receivedDuringTurn: boolean;
  } | null>(null);
  const menuCloseTimer = useRef<number | null>(null);
  const messagesRef = useRef<HTMLElement | null>(null);
  const followLatestMessageRef = useRef(true);
  const programmaticMessageScrollRef = useRef(false);
  const latestRenderedMessageRef = useRef<string | null>(null);
  const latestRenderedMessageIdRef = useRef<string | null>(null);
  const pushToTalkPressedRef = useRef(false);
  const pushToTalkSpaceCapturedRef = useRef(false);
  const pushToTalkTurnActiveRef = useRef(false);
  const pushToTalkStartRef = useRef<Promise<void> | null>(null);
  const pushToTalkFinishRef = useRef<Promise<void> | null>(null);
  const continuousTransitionRef = useRef(false);
  const latestAgentMessageIdRef = useRef<string | null>(null);
  const latestAgentMessageTextRef = useRef('');
  const exploreRequestVersionRef = useRef(0);
  const recordedDiagnosticMessagesRef = useRef(new Set<string>());
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const agent = useAgent();
  const { isSending: isSendingText, messages, send: sendText } = useSessionMessages();
  const { perform } = useRpc();
  const english = preferences.locale === 'en-US';
  const copy = english
    ? {
        collapse: 'Collapse',
        connectVoice: 'Connect voice',
        connectionIssue: 'Voice service is temporarily unavailable',
        continuousConversation: 'Continuous conversation',
        endContinuousConversation: 'End continuous conversation',
        explore: 'Explore',
        exploring: 'Exploring…',
        exploreConfigurationDescription: 'Check the service configuration, then try again.',
        exploreConfigurationTitle: 'Explore needs setup',
        exploreNoContextDescription: 'Start a conversation or connect flight data, then try again.',
        exploreNoContextTitle: 'Nothing to explore yet',
        exploreRetryDescription: 'Try again in a moment.',
        exploreRetry: 'Retry',
        exploreSettings: 'Open settings',
        exploreUnavailable: 'Explore is temporarily unavailable',
        enterText: 'Type a message, Enter to send',
        inputAfterConnection: 'Connect Xiaoxiao to type a message',
        messageInput: 'Text input',
        micUnavailable: 'Microphone unavailable',
        newMessages: 'New messages',
        openConfiguration: 'Open configuration file',
        pressToTalk: 'Hold to talk',
        recentConversation: 'Recent conversation',
        reconnect: 'Retry',
        releaseToEnd: 'Release to finish',
        sourceCount: (count: number) => `${count} web sources found`,
        text: 'Text',
        thinking: 'Xiaoxiao is thinking',
        usingTools: 'Using tools',
        voiceDisconnected: 'Voice disconnected',
        voiceInput: 'Voice input',
        waitingForGuide: 'Preparing Xiaoxiao',
        waitingForYou: 'Ready to talk',
        youCanStart: 'You can start a conversation',
      }
    : {
        collapse: '收起',
        connectVoice: '连接语音',
        connectionIssue: '语音服务暂时不可用',
        continuousConversation: '连续对话',
        endContinuousConversation: '结束连续对话',
        explore: '探索',
        exploring: '正在探索…',
        exploreConfigurationDescription: '请检查服务配置后重试。',
        exploreConfigurationTitle: '探索需要完成配置',
        exploreNoContextDescription: '先聊一句，或连接飞行数据后再试。',
        exploreNoContextTitle: '暂无可探索内容',
        exploreRetryDescription: '请稍后重试。',
        exploreRetry: '重试',
        exploreSettings: '前往设置',
        exploreUnavailable: '探索暂时不可用',
        enterText: '输入文字，Enter 发送',
        inputAfterConnection: '连接晓晓后即可输入文字',
        messageInput: '文字输入',
        micUnavailable: '麦克风不可用',
        newMessages: '新消息',
        openConfiguration: '打开配置文件',
        pressToTalk: '按住说话',
        recentConversation: '最近对话',
        reconnect: '重新检测',
        releaseToEnd: '松开结束',
        sourceCount: (count: number) => `已检索 ${count} 个网页来源`,
        text: '文字',
        thinking: '晓晓正在思考',
        usingTools: '正在调用工具',
        voiceDisconnected: '语音已挂断',
        voiceInput: '语音输入',
        waitingForGuide: '正在准备晓晓',
        waitingForYou: '等待你说话',
        youCanStart: '可以开始对话了',
      };

  const publishOptions = useMemo(() => ({ name: 'desktop-microphone' }), []);
  const microphone = useTrackToggle({
    source: Track.Source.Microphone,
    room: session.room,
    initialState: false,
    captureOptions: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    publishOptions,
    onDeviceError: (error) => setMicrophoneError(error.message),
  });
  const microphoneLevel = useTrackVolume(session.local.microphoneTrack);
  const continuousActive = preferences.voiceInputMode === 'continuous' && microphone.enabled;

  const displayMessages = useMemo(
    () => createDisplayMessages(messages, session.room.localParticipant.identity, sourcesByMessage),
    [messages, session.room.localParticipant.identity, sourcesByMessage],
  );
  const exploreConversation = useMemo(
    () =>
      createDisplayMessages(
        messages,
        session.room.localParticipant.identity,
        sourcesByMessage,
        16,
      ).map(({ id, role, text }) => ({ id, role, text })),
    [messages, session.room.localParticipant.identity, sourcesByMessage],
  );

  useEffect(() => {
    for (const message of displayMessages) {
      const signature = `${message.id}:${message.text}`;
      if (recordedDiagnosticMessagesRef.current.has(signature)) continue;
      recordedDiagnosticMessagesRef.current.add(signature);
      window.desktop?.recordDiagnosticConversation({
        id: message.id,
        role: message.role,
        text: message.text,
      });
    }
  }, [displayMessages]);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'auto') => {
    const messageList = messagesRef.current;
    if (!messageList) return;
    followLatestMessageRef.current = true;
    programmaticMessageScrollRef.current = behavior === 'smooth';
    setHasUnreadMessages(false);
    messageList.scrollTo({ top: messageList.scrollHeight, behavior });
  }, []);

  const updateMessageScrollPosition = useCallback(() => {
    const messageList = messagesRef.current;
    if (!messageList) return;
    const distanceFromBottom =
      messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
    const isFollowingLatest = distanceFromBottom <= 48;
    if (programmaticMessageScrollRef.current) {
      if (isFollowingLatest) programmaticMessageScrollRef.current = false;
      else return;
    }
    followLatestMessageRef.current = isFollowingLatest;
    if (isFollowingLatest) setHasUnreadMessages(false);
  }, []);

  useLayoutEffect(() => {
    if (collapsed) return;
    const latestMessage = displayMessages.at(-1);
    if (!latestMessage) {
      latestRenderedMessageRef.current = null;
      latestRenderedMessageIdRef.current = null;
      setHasUnreadMessages(false);
      return;
    }

    const renderSignature = `${latestMessage.id}:${latestMessage.text}:${latestMessage.sourcePreview?.sources.map((source) => source.url).join('|') ?? ''}`;
    if (renderSignature === latestRenderedMessageRef.current) return;

    const isNewLocalMessage =
      latestMessage.role === 'user' && latestMessage.id !== latestRenderedMessageIdRef.current;
    latestRenderedMessageRef.current = renderSignature;
    latestRenderedMessageIdRef.current = latestMessage.id;

    if (followLatestMessageRef.current || isNewLocalMessage) {
      scrollToLatestMessage(isNewLocalMessage && preferences.interfaceMotion ? 'smooth' : 'auto');
    } else {
      setHasUnreadMessages(true);
    }
  }, [collapsed, displayMessages, preferences.interfaceMotion, scrollToLatestMessage]);

  useLayoutEffect(() => {
    if (!collapsed && followLatestMessageRef.current) scrollToLatestMessage('auto');
  }, [collapsed, scrollToLatestMessage, textComposerOpen]);

  const latestAgentMessageId =
    [...displayMessages].reverse().find((message) => message.role === 'assistant')?.id ?? null;
  const latestAgentMessageText =
    [...displayMessages].reverse().find((message) => message.role === 'assistant')?.text ?? '';
  latestAgentMessageIdRef.current = latestAgentMessageId;
  latestAgentMessageTextRef.current = latestAgentMessageText;

  useEffect(() => {
    if (!latestAgentMessageId || !pendingSources) return;
    if (
      !shouldAttachSourcePreview(
        pendingSources,
        { id: latestAgentMessageId, text: latestAgentMessageText },
        agent.state,
      )
    )
      return;
    setSourcesByMessage((current) => ({
      ...current,
      [latestAgentMessageId]: pendingSources.preview,
    }));
    setPendingSources(null);
  }, [agent.state, latestAgentMessageId, latestAgentMessageText, pendingSources]);

  const onSourcesMessage = useCallback(
    (message: { payload: Uint8Array }) => {
      const parsed = parseGuideSourcesMessage(new TextDecoder().decode(message.payload));
      if (!parsed) return;
      window.desktop?.recordDiagnosticToolEvent({ type: 'guide.sources', event: parsed });
      setPendingSources({
        preview: parsed,
        anchorMessageId: latestAgentMessageIdRef.current,
        anchorMessageText: latestAgentMessageTextRef.current,
        receivedDuringTurn: agent.state === 'thinking' || agent.state === 'speaking',
      });
    },
    [agent.state],
  );
  useDataChannel(guideSourcesTopic, onSourcesMessage);
  const onToolEvent = useCallback((message: { payload: Uint8Array }) => {
    const parsed = parseGuideToolEvent(new TextDecoder().decode(message.payload));
    if (parsed) window.desktop?.recordDiagnosticToolEvent({ type: 'guide.tools', event: parsed });
  }, []);
  useDataChannel(guideToolEventsTopic, onToolEvent);

  const performGuideRpc = useCallback(
    async (method: GuideVoiceRpcMethod) => {
      if (!agent.identity) throw new Error('语音导游尚未加入会话');
      await perform(
        {
          destinationIdentity: agent.identity,
          method,
          payload: '',
          responseTimeout: 10_000,
        },
        serializers.raw(),
      );
    },
    [agent.identity, perform],
  );

  const agentFailure = agent.state === 'failed' ? agent.failureReasons.join('；') : '';
  const msfsStatus = agent.attributes[msfsReadinessAttributes.status] as
    MsfsReadinessStatus | undefined;
  const msfsMessage = agent.attributes[msfsReadinessAttributes.message];
  const errorMessage = microphoneError || controlError || startupError || agentFailure;
  const userStateValue = agent.attributes[guideVoiceAttributes.userState];
  const userState = isGuideUserState(userStateValue) ? userStateValue : undefined;
  const toolActivityValue = agent.attributes[guideVoiceAttributes.toolActivity];
  const toolActivity = isGuideToolActivity(toolActivityValue) ? toolActivityValue : undefined;

  useEffect(() => {
    if (userState === 'speaking') setUsedToolsInTurn(false);
  }, [userState]);

  useEffect(() => {
    if (toolActivity === 'calling') setUsedToolsInTurn(true);
  }, [toolActivity]);

  const setupBlocked =
    Boolean(startupError) ||
    Boolean(readiness) ||
    agent.state === 'failed' ||
    (!starting && session.connectionState === ConnectionState.Disconnected);
  const voiceChannelActive = voiceChannelConnected && !setupBlocked;
  const interactionBlocked = setupBlocked || !agent.canListen || !voiceChannelConnected;
  const textInputBlocked = setupBlocked || !agent.isConnected;
  const avatarExpression = resolveGuideAvatarExpression({
    agentState: agent.state,
    connectionState: session.connectionState,
    hasError: Boolean(errorMessage) || !voiceChannelConnected,
    usedToolsInTurn,
    ...(toolActivity ? { toolActivity } : {}),
    ...(userState ? { userState } : {}),
  });
  const avatarPresence =
    Boolean(errorMessage) || !voiceChannelConnected || setupBlocked
      ? 'error'
      : session.isConnected && agent.isConnected
        ? 'online'
        : 'neutral';
  const assistantActivity =
    !setupBlocked &&
    userState !== 'speaking' &&
    (toolActivity === 'calling' || agent.state === 'thinking')
      ? toolActivity === 'calling'
        ? copy.usingTools
        : copy.thinking
      : null;
  const voiceButtonState = microphoneError
    ? 'error'
    : voiceTransitioning || microphone.pending || starting || agent.isPending
      ? 'requesting'
      : microphone.enabled
        ? 'listening'
        : 'idle';

  const submitTextMessage = useCallback(async () => {
    const message = textDraft.trim();
    if (!message || textInputBlocked || isSendingText) return;

    setTextInputError('');
    setUsedToolsInTurn(false);
    try {
      await sendText(message);
      setTextDraft((current) => (current === textDraft ? '' : current));
    } catch (error) {
      setTextInputError(error instanceof Error ? error.message : '文字消息发送失败，请重试');
    }
  }, [isSendingText, sendText, textDraft, textInputBlocked]);

  const requestExplore = useCallback(async () => {
    if (exploring || !window.desktop) return;
    const preferencesSnapshot = explorePreferencesSchema.safeParse({
      encyclopedia: preferences.exploreEncyclopedia,
      videoPlatforms: preferences.exploreVideoPlatforms,
    });
    if (!preferencesSnapshot.success) {
      setExploreNotice({
        kind: 'configuration',
        title: copy.exploreConfigurationTitle,
        description: copy.exploreConfigurationDescription,
      });
      return;
    }
    const requestVersion = ++exploreRequestVersionRef.current;
    setExploreNotice(null);
    setExploring(true);
    try {
      const request: ExploreRequest = {
        recentConversation: exploreConversation,
        preferences: preferencesSnapshot.data,
        locale: preferences.locale,
      };
      const result = await window.desktop.requestExplore(request);
      if (requestVersion === exploreRequestVersionRef.current && !result.ok) {
        if (result.code === 'cancelled') return;
        if (result.code === 'no_context') {
          setExploreNotice({
            kind: 'context',
            title: copy.exploreNoContextTitle,
            description: copy.exploreNoContextDescription,
          });
          return;
        }
        if (result.code === 'configuration') {
          setExploreNotice({
            kind: 'configuration',
            title: copy.exploreConfigurationTitle,
            description: copy.exploreConfigurationDescription,
          });
          return;
        }
        setExploreNotice({
          kind: 'error',
          title: copy.exploreUnavailable,
          description: copy.exploreRetryDescription,
        });
      }
    } catch {
      if (requestVersion === exploreRequestVersionRef.current) {
        setExploreNotice({
          kind: 'error',
          title: copy.exploreUnavailable,
          description: copy.exploreRetryDescription,
        });
      }
    } finally {
      if (requestVersion === exploreRequestVersionRef.current) setExploring(false);
    }
  }, [
    copy.exploreConfigurationDescription,
    copy.exploreConfigurationTitle,
    copy.exploreNoContextDescription,
    copy.exploreNoContextTitle,
    copy.exploreRetry,
    copy.exploreRetryDescription,
    copy.exploreUnavailable,
    exploreConversation,
    exploring,
    preferences,
  ]);

  useEffect(() => {
    if (!exploreNotice || exploreNotice.kind === 'configuration') return;
    const timeout = window.setTimeout(() => setExploreNotice(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [exploreNotice]);

  useEffect(
    () =>
      window.desktop?.onExplorePrefillSuggestion((text) => {
        setTextComposerOpen(true);
        setTextDraft(text);
        setTextInputError('');
      }),
    [],
  );

  useEffect(() => {
    if (!textComposerOpen) return;
    window.requestAnimationFrame(() => textInputRef.current?.focus());
  }, [textComposerOpen]);

  const beginPushToTalk = useCallback(() => {
    if (
      preferences.voiceInputMode !== 'push_to_talk' ||
      interactionBlocked ||
      pushToTalkPressedRef.current ||
      pushToTalkFinishRef.current
    ) {
      return;
    }
    setControlError('');
    setMicrophoneError('');
    pushToTalkPressedRef.current = true;
    const startPromise = (async () => {
      await performGuideRpc(guideVoiceRpc.startTurn);
      pushToTalkTurnActiveRef.current = true;
      if (!pushToTalkPressedRef.current) {
        pushToTalkTurnActiveRef.current = false;
        await performGuideRpc(guideVoiceRpc.cancelTurn);
        return;
      }
      await microphone.toggle(true);
    })()
      .catch(async (error) => {
        pushToTalkPressedRef.current = false;
        setControlError(error instanceof Error ? error.message : '按住说话启动失败');
        if (pushToTalkTurnActiveRef.current) {
          pushToTalkTurnActiveRef.current = false;
          await performGuideRpc(guideVoiceRpc.cancelTurn).catch(() => undefined);
        }
        await microphone.toggle(false).catch(() => undefined);
      })
      .finally(() => {
        if (pushToTalkStartRef.current === startPromise) pushToTalkStartRef.current = null;
      });
    pushToTalkStartRef.current = startPromise;
  }, [interactionBlocked, microphone, performGuideRpc, preferences.voiceInputMode]);

  const finishPushToTalk = useCallback(
    (cancel = false) => {
      pushToTalkPressedRef.current = false;
      if (pushToTalkFinishRef.current) return pushToTalkFinishRef.current;
      const startPromise = pushToTalkStartRef.current;
      const finishPromise = (async () => {
        await startPromise?.catch(() => undefined);
        if (!pushToTalkTurnActiveRef.current) {
          await microphone.toggle(false);
          return;
        }
        pushToTalkTurnActiveRef.current = false;
        try {
          await performGuideRpc(cancel ? guideVoiceRpc.cancelTurn : guideVoiceRpc.endTurn);
        } finally {
          await microphone.toggle(false);
        }
      })()
        .catch(async (error) => {
          setControlError(error instanceof Error ? error.message : '按住说话结束失败');
          await microphone.toggle(false).catch(() => undefined);
        })
        .finally(() => {
          if (pushToTalkFinishRef.current === finishPromise) pushToTalkFinishRef.current = null;
        });
      pushToTalkFinishRef.current = finishPromise;
      return finishPromise;
    },
    [microphone, performGuideRpc],
  );

  const startContinuousConversation = useCallback(async () => {
    if (continuousTransitionRef.current || continuousActive || interactionBlocked) return;
    continuousTransitionRef.current = true;
    setVoiceTransitioning(true);
    setControlError('');
    setMicrophoneError('');
    try {
      await performGuideRpc(guideVoiceRpc.startContinuous);
      await microphone.toggle(true);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : '连续对话启动失败');
      await microphone.toggle(false).catch(() => undefined);
      await performGuideRpc(guideVoiceRpc.stopContinuous).catch(() => undefined);
    } finally {
      continuousTransitionRef.current = false;
      setVoiceTransitioning(false);
    }
  }, [continuousActive, interactionBlocked, microphone, performGuideRpc]);

  const stopContinuousConversation = useCallback(async () => {
    if (continuousTransitionRef.current) return;
    continuousTransitionRef.current = true;
    setVoiceTransitioning(true);
    setControlError('');
    try {
      await microphone.toggle(false);
      await performGuideRpc(guideVoiceRpc.stopContinuous);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : '连续对话停止失败');
      await microphone.toggle(false).catch(() => undefined);
    } finally {
      continuousTransitionRef.current = false;
      setVoiceTransitioning(false);
    }
  }, [microphone, performGuideRpc]);

  const changeVoiceInputMode = useCallback(
    async (nextMode: VoiceInputMode) => {
      if (continuousTransitionRef.current || nextMode === preferences.voiceInputMode) return;
      if (preferences.voiceInputMode === 'push_to_talk') await finishPushToTalk(true);
      else await stopContinuousConversation();
      updatePreference('voiceInputMode', nextMode);
    },
    [finishPushToTalk, preferences.voiceInputMode, stopContinuousConversation, updatePreference],
  );

  const selectVoiceInputMode = useCallback(
    async (nextMode: VoiceInputMode) => {
      await changeVoiceInputMode(nextMode);
      setVoiceModeMenuOpen(false);
    },
    [changeVoiceInputMode],
  );

  const hangUpVoiceChannel = useCallback(async () => {
    setVoiceModeMenuOpen(false);
    setControlError('');
    onVoiceChannelChange(false);
    setVoiceTransitioning(true);
    try {
      if (preferences.voiceInputMode === 'push_to_talk') await finishPushToTalk(true);
      else await microphone.toggle(false);
      await performGuideRpc(guideVoiceRpc.suspendVoice);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : '挂断语音失败');
      await microphone.toggle(false).catch(() => undefined);
    } finally {
      setVoiceTransitioning(false);
    }
  }, [
    finishPushToTalk,
    microphone,
    onVoiceChannelChange,
    performGuideRpc,
    preferences.voiceInputMode,
  ]);

  const connectVoiceChannel = useCallback(async () => {
    setControlError('');
    setMicrophoneError('');
    setVoiceTransitioning(true);
    try {
      if (setupBlocked) await retry();
      else await performGuideRpc(guideVoiceRpc.resumeVoice);
      onVoiceChannelChange(true);
    } catch (error) {
      setControlError(error instanceof Error ? error.message : '恢复语音失败');
      onVoiceChannelChange(false);
    } finally {
      setVoiceTransitioning(false);
    }
  }, [onVoiceChannelChange, performGuideRpc, retry, setupBlocked]);

  useEffect(
    () =>
      window.desktop?.onGlobalPushToTalk((event) => {
        if (event.type === 'press') {
          if (voiceChannelActive) beginPushToTalk();
          return;
        }
        if (pushToTalkPressedRef.current) void finishPushToTalk(event.type === 'cancel');
      }),
    [beginPushToTalk, finishPushToTalk, voiceChannelActive],
  );

  useEffect(() => {
    const enabled =
      preferences.voiceInputMode === 'push_to_talk' &&
      voiceChannelActive &&
      isGlobalPushToTalkKey(preferences.globalPushToTalkKey);
    void window.desktop?.configureGlobalPushToTalk({
      key: isGlobalPushToTalkKey(preferences.globalPushToTalkKey)
        ? preferences.globalPushToTalkKey
        : defaultPreferences.globalPushToTalkKey,
      enabled,
    });
    return () => {
      void window.desktop?.configureGlobalPushToTalk({
        key: defaultPreferences.globalPushToTalkKey,
        enabled: false,
      });
    };
  }, [preferences.globalPushToTalkKey, preferences.voiceInputMode, voiceChannelActive]);

  useEffect(() => {
    if (preferences.voiceInputMode !== 'push_to_talk') return;
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return (
        element?.isContentEditable ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableTarget(event.target) ||
        browserDialog ||
        voiceModeMenuOpen ||
        collapsed
      ) {
        return;
      }
      event.preventDefault();
      pushToTalkSpaceCapturedRef.current = true;
      if (event.repeat || !voiceChannelActive) return;
      beginPushToTalk();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !pushToTalkSpaceCapturedRef.current) return;
      event.preventDefault();
      pushToTalkSpaceCapturedRef.current = false;
      if (pushToTalkPressedRef.current) void finishPushToTalk();
    };
    const onBlur = () => {
      pushToTalkSpaceCapturedRef.current = false;
      if (pushToTalkPressedRef.current) void finishPushToTalk(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') onBlur();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    beginPushToTalk,
    browserDialog,
    collapsed,
    finishPushToTalk,
    preferences.voiceInputMode,
    voiceChannelActive,
    voiceModeMenuOpen,
  ]);

  useEffect(
    () => () => {
      if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
    },
    [],
  );
  useEffect(() => {
    void window.desktop?.getAssistantState().then((state) => setCollapsed(state.collapsed));
  }, []);

  const clearMenuCloseTimer = () => {
    if (menuCloseTimer.current === null) return;
    window.clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = null;
  };
  const openMenu = async () => {
    clearMenuCloseTimer();
    const direction = (await window.desktop?.setBallMenuOpen(true)) ?? 'down';
    setMenuDirection(direction);
    setMenuOpen(true);
  };
  const closeMenu = async () => {
    clearMenuCloseTimer();
    setMenuOpen(false);
    await window.desktop?.setBallMenuOpen(false);
  };
  const scheduleMenuClose = () => {
    clearMenuCloseTimer();
    menuCloseTimer.current = window.setTimeout(() => {
      menuCloseTimer.current = null;
      void closeMenu();
    }, 180);
  };
  const changeCollapsed = async (next: boolean) => {
    if (!next) {
      await closeMenu();
      if (session.connectionState === ConnectionState.Disconnected && !starting) void retry();
    }
    setCollapsed(next);
    await window.desktop?.setCollapsed(next);
  };
  const closeCurrentConversation = useCallback(async () => {
    if (closingConversation) return;
    setClosingConversation(true);
    setBrowserDialog(null);
    exploreRequestVersionRef.current += 1;
    setExploring(false);
    setExploreNotice(null);
    void window.desktop?.cancelExplore();
    try {
      if (preferences.voiceInputMode === 'push_to_talk') await finishPushToTalk(true);
      else await microphone.toggle(false);
      await performGuideRpc(guideVoiceRpc.suspendVoice).catch(() => undefined);
      await endSession();
    } catch (error) {
      setControlError(error instanceof Error ? error.message : '结束当前对话失败');
      return;
    } finally {
      setSourcesByMessage({});
      setPendingSources(null);
      setTextComposerOpen(false);
      setTextDraft('');
      setTextInputError('');
      setUsedToolsInTurn(false);
      setClosingConversation(false);
    }
    await changeCollapsed(true);
  }, [
    changeCollapsed,
    closingConversation,
    endSession,
    finishPushToTalk,
    microphone,
    performGuideRpc,
    preferences.voiceInputMode,
  ]);
  const requestCloseConversation = () => {
    const hasActiveTurn =
      exploring ||
      microphone.enabled ||
      voiceTransitioning ||
      toolActivity === 'calling' ||
      agent.state === 'thinking' ||
      agent.state === 'speaking';
    if (hasActiveTurn) {
      setBrowserDialog('end-conversation');
      return;
    }
    void closeCurrentConversation();
  };
  const openUtility = async (kind: UtilityDialog) => {
    await closeMenu();
    if (window.desktop) {
      const opened =
        kind === 'settings'
          ? await window.desktop.openSettings()
          : await window.desktop.openQuitDialog();
      if (opened) return;
    }
    setBrowserDialog(kind);
  };
  const openSource = async (url: string) => {
    if (!window.desktop) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (preferences.openSourcesInApp) await window.desktop.openSource(url);
    else await window.desktop.openExternal(url);
  };
  const openSourcePreview = async (preview: GuideSourcesMessage) => {
    if (!window.desktop) {
      const firstSource = preview.sources[0];
      if (firstSource) window.open(firstSource.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (preferences.openSourcesInApp) await window.desktop.openSourcePreview(preview);
    else if (preview.sources[0]) await window.desktop.openExternal(preview.sources[0].url);
  };

  if (collapsed) {
    return (
      <div
        className={`collapsed-stage collapsed-stage--${menuDirection} ${menuOpen ? 'collapsed-stage--menu-open' : ''}`}
        onPointerEnter={() => void openMenu()}
        onPointerLeave={scheduleMenuClose}
        onFocus={() => void openMenu()}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) scheduleMenuClose();
        }}
      >
        <div className="ball-shell">
          <button
            className="ball-open no-drag"
            onClick={() => void changeCollapsed(false)}
            aria-label={english ? 'Expand Xiaoxiao' : '展开晓晓'}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={english ? 'Expand Xiaoxiao' : '点击展开晓晓'}
          >
            <GuideFloatingPortrait />
          </button>
          <div
            className="ball-drag-handle drag-region"
            title={english ? 'Drag Xiaoxiao' : '按住这里拖动晓晓'}
          >
            <span className="ball-drag-grip" aria-hidden="true" />
          </div>
        </div>
        <div
          className="ball-menu no-drag"
          role="menu"
          aria-label="悬浮助手菜单"
          aria-hidden={!menuOpen}
        >
          <button
            type="button"
            className="ball-menu-button"
            role="menuitem"
            aria-label={english ? 'Open preferences' : '打开设置'}
            title={english ? 'Preferences' : '设置'}
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => void openUtility('settings')}
          >
            <GearSixIcon size={19} weight="regular" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ball-menu-button ball-menu-button--danger"
            role="menuitem"
            aria-label={english ? 'Quit app' : '退出应用'}
            title={english ? 'Quit app' : '退出应用'}
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => void openUtility('quit')}
          >
            <PowerIcon size={19} weight="regular" aria-hidden="true" />
          </button>
        </div>
        {browserDialog ? (
          <div className="browser-dialog-backdrop">
            {browserDialog === 'settings' ? (
              <SettingsDialog
                preferences={preferences}
                savePreferences={savePreferences}
                onClose={() => setBrowserDialog(null)}
              />
            ) : browserDialog === 'quit' ? (
              <QuitDialog onClose={() => setBrowserDialog(null)} />
            ) : (
              <EndConversationDialog
                closing={closingConversation}
                english={english}
                onClose={() => setBrowserDialog(null)}
                onConfirm={() => void closeCurrentConversation()}
              />
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="assistant-card">
      <header className="drag-bar">
        <span className="header-explore-control no-drag">
          <button
            type="button"
            className={`header-icon-button header-explore-button ${exploring ? 'is-exploring' : ''} ${exploreNotice ? `has-${exploreNotice.kind}-notice` : ''}`}
            aria-label={exploring ? copy.exploring : copy.explore}
            disabled={exploring}
            onClick={() => void requestExplore()}
            title={exploring ? copy.exploring : copy.explore}
          >
            <CompassIcon className="explore-compass" size={19} aria-hidden="true" />
          </button>
          {exploreNotice ? (
            <span className={`explore-notice explore-notice--${exploreNotice.kind}`} role="status">
              <strong>{exploreNotice.title}</strong>
              <small>{exploreNotice.description}</small>
              <span className="explore-notice-actions">
                {exploreNotice.kind === 'configuration' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setExploreNotice(null);
                      void openUtility('settings');
                    }}
                  >
                    {copy.exploreSettings}
                  </button>
                ) : exploreNotice.kind === 'error' ? (
                  <button type="button" onClick={() => void requestExplore()}>
                    {copy.exploreRetry}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="explore-notice-dismiss"
                  aria-label={english ? 'Dismiss explore notice' : '关闭探索提示'}
                  onClick={() => setExploreNotice(null)}
                  title={english ? 'Dismiss' : '关闭'}
                >
                  <XIcon size={12} weight="bold" aria-hidden="true" />
                </button>
              </span>
            </span>
          ) : null}
        </span>
        {exploring ? <span className="explore-progress" aria-hidden="true" /> : null}
        <span
          className={`header-avatar header-avatar--${avatarPresence}`}
          data-expression={avatarExpression}
          title={errorMessage || undefined}
          aria-label={
            avatarPresence === 'online' ? (english ? 'Xiaoxiao is online' : '晓晓在线') : undefined
          }
        >
          <GuideExpression state={avatarExpression} />
        </span>
        <span className="header-actions no-drag">
          <button
            type="button"
            className="header-icon-button"
            aria-label={copy.collapse}
            disabled={closingConversation}
            onClick={() => void changeCollapsed(true)}
            title={copy.collapse}
          >
            <MinusIcon size={17} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="header-icon-button header-close-button"
            aria-label={english ? 'End and close this conversation' : '结束并关闭当前对话'}
            disabled={closingConversation}
            onClick={requestCloseConversation}
            title={english ? 'End and close this conversation' : '结束并关闭当前对话'}
          >
            <XIcon size={16} weight="bold" aria-hidden="true" />
          </button>
        </span>
      </header>
      {msfsStatus && msfsStatus !== 'ready' ? (
        <div className="msfs-readiness-note" role="status" data-msfs-status={msfsStatus}>
          {msfsMessage ||
            (english
              ? 'Flight data is temporarily unavailable. You can still chat normally.'
              : '模拟器飞行数据暂不可用，普通对话仍可继续。')}
        </div>
      ) : null}
      <div className="messages-shell">
        <section
          ref={messagesRef}
          className="messages"
          aria-label={copy.recentConversation}
          aria-live="polite"
          onScroll={updateMessageScrollPosition}
          onWheel={() => {
            programmaticMessageScrollRef.current = false;
          }}
        >
          {setupBlocked ? (
            <div className="readiness-card" role="status">
              <WarningCircleIcon size={24} weight="duotone" aria-hidden="true" />
              <strong>{readiness?.message ?? errorMessage ?? copy.connectionIssue}</strong>
              {(readiness?.issues ?? agent.failureReasons ?? []).slice(0, 4).map((issue) => (
                <small key={issue}>{issue}</small>
              ))}
              <div className="readiness-actions">
                {readiness?.status === 'setup_required' ? (
                  <button type="button" onClick={() => void window.desktop?.openConfiguration()}>
                    {copy.openConfiguration}
                  </button>
                ) : null}
                <button type="button" onClick={() => void retry()}>
                  {copy.reconnect}
                </button>
              </div>
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="empty-conversation">
              <span className="empty-conversation-icon" aria-hidden="true">
                <SparkleIcon size={22} weight="duotone" />
              </span>
              <strong>
                {!voiceChannelConnected
                  ? copy.voiceDisconnected
                  : session.isConnected
                    ? copy.youCanStart
                    : copy.waitingForGuide}
              </strong>
              <small>
                {!voiceChannelConnected
                  ? english
                    ? 'Text input is still available. Reconnect voice to restore the previous mode.'
                    : '仍可使用文字输入，连接语音后恢复上次模式'
                  : preferences.voiceInputMode === 'continuous'
                    ? english
                      ? 'Start to speak naturally without holding the button.'
                      : '点击开始后即可持续自然对话'
                    : english
                      ? 'Hold the button or Space to talk, then release for a reply.'
                      : '按住按钮或空格键说话，松开后等待回答'}
              </small>
            </div>
          ) : (
            <>
              {displayMessages.map((message) =>
                message.role === 'user' ? (
                  <p key={message.id} className="bubble user">
                    {message.text}
                  </p>
                ) : (
                  <div key={message.id} className="guide-reply">
                    <div className="bubble markdown-content">
                      <MessageMarkdown onOpenLink={openSource}>{message.text}</MessageMarkdown>
                    </div>
                    {message.sourcePreview ? (
                      <button
                        className="source-preview-pill no-drag"
                        onClick={() => void openSourcePreview(message.sourcePreview!)}
                      >
                        <BrowserIcon size={13} weight="duotone" aria-hidden="true" />
                        <span>{copy.sourceCount(message.sourcePreview.sources.length)}</span>
                        <CaretDownIcon size={11} weight="bold" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ),
              )}
              {assistantActivity ? (
                <div className="assistant-activity" role="status" aria-live="polite">
                  <CircleNotchIcon
                    className="assistant-activity-icon"
                    size={13}
                    aria-hidden="true"
                  />
                  <span>{assistantActivity}</span>
                </div>
              ) : null}
            </>
          )}
        </section>
        {hasUnreadMessages ? (
          <button
            type="button"
            className="new-message-button no-drag"
            onClick={() => scrollToLatestMessage(preferences.interfaceMotion ? 'smooth' : 'auto')}
          >
            <span>{copy.newMessages}</span>
            <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {textComposerOpen ? (
        <form
          id="text-composer"
          className="text-composer no-drag"
          aria-label={copy.messageInput}
          onSubmit={(event) => {
            event.preventDefault();
            void submitTextMessage();
          }}
        >
          <div className="text-composer-row">
            <textarea
              ref={textInputRef}
              aria-label={english ? 'Type a text message' : '输入文字消息'}
              aria-describedby={textInputError ? 'text-input-error' : undefined}
              disabled={textInputBlocked}
              maxLength={maximumTextMessageLength}
              placeholder={textInputBlocked ? copy.inputAfterConnection : copy.enterText}
              rows={1}
              value={textDraft}
              onChange={(event) => {
                setTextDraft(event.target.value);
                if (textInputError) setTextInputError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setTextComposerOpen(false);
                  return;
                }
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
                  return;
                }
                event.preventDefault();
                void submitTextMessage();
              }}
            />
            <button
              type="submit"
              className="text-send-button"
              aria-label={
                isSendingText
                  ? english
                    ? 'Sending text message'
                    : '正在发送文字消息'
                  : english
                    ? 'Send text message'
                    : '发送文字消息'
              }
              disabled={textInputBlocked || isSendingText || !textDraft.trim()}
              title={english ? 'Send' : '发送'}
            >
              <PaperPlaneTiltIcon size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
          {textInputError ? (
            <small id="text-input-error" className="text-input-error" role="alert">
              {textInputError}
            </small>
          ) : null}
        </form>
      ) : null}
      <footer className="input-console no-drag">
        <button
          type="button"
          className={`console-text-button ${textComposerOpen ? 'is-active' : ''}`}
          aria-expanded={textComposerOpen}
          aria-controls="text-composer"
          onClick={() => {
            setVoiceModeMenuOpen(false);
            setTextComposerOpen((open) => !open);
          }}
          title={
            textComposerOpen
              ? english
                ? 'Hide text input'
                : '收起文字输入'
              : english
                ? 'Show text input'
                : '展开文字输入'
          }
        >
          <KeyboardIcon
            size={16}
            weight={textComposerOpen ? 'fill' : 'regular'}
            aria-hidden="true"
          />
          <span>{copy.text}</span>
          {textComposerOpen ? (
            <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
          ) : (
            <CaretUpIcon size={12} weight="bold" aria-hidden="true" />
          )}
        </button>
        <div
          className="voice-mode-control"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setVoiceModeMenuOpen(false);
          }}
        >
          {voiceModeMenuOpen ? (
            <div
              className="voice-mode-menu"
              role="menu"
              aria-label={english ? 'Choose voice mode' : '选择语音模式'}
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={preferences.voiceInputMode === 'push_to_talk'}
                onClick={() => void selectVoiceInputMode('push_to_talk')}
              >
                <MicrophoneIcon size={16} aria-hidden="true" />
                <span>{english ? 'Push to talk' : copy.pressToTalk}</span>
                {preferences.voiceInputMode === 'push_to_talk' ? (
                  <CheckIcon size={13} weight="bold" aria-hidden="true" />
                ) : null}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={preferences.voiceInputMode === 'continuous'}
                onClick={() => void selectVoiceInputMode('continuous')}
              >
                <WaveformIcon size={16} aria-hidden="true" />
                <span>{copy.continuousConversation}</span>
                {preferences.voiceInputMode === 'continuous' ? (
                  <CheckIcon size={13} weight="bold" aria-hidden="true" />
                ) : null}
              </button>
            </div>
          ) : null}
          <div className={`voice-mode-split voice-mode-split--${voiceButtonState}`}>
            <button
              className={`voice-button no-drag voice-button--${voiceButtonState}`}
              type="button"
              aria-label={
                preferences.voiceInputMode === 'continuous'
                  ? continuousActive
                    ? copy.endContinuousConversation
                    : english
                      ? 'Start continuous conversation'
                      : '开始连续对话'
                  : microphone.enabled
                    ? english
                      ? 'Listening, release to finish'
                      : '正在聆听，松开结束'
                    : english
                      ? 'Hold to talk, or hold Space'
                      : '按住说话，或按住空格键说话'
              }
              aria-pressed={microphone.enabled}
              disabled={interactionBlocked || voiceTransitioning}
              title={
                errorMessage ||
                (!voiceChannelConnected
                  ? english
                    ? 'Connect voice first'
                    : '请先连接语音'
                  : preferences.voiceInputMode === 'push_to_talk'
                    ? english
                      ? 'You can also hold Space to talk'
                      : '也可以按住空格键说话'
                    : undefined)
              }
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (preferences.voiceInputMode !== 'push_to_talk' || event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                beginPushToTalk();
              }}
              onPointerUp={(event) => {
                if (preferences.voiceInputMode !== 'push_to_talk') return;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                void finishPushToTalk();
              }}
              onPointerCancel={() => {
                if (preferences.voiceInputMode === 'push_to_talk') void finishPushToTalk(true);
              }}
              onClick={() => {
                if (preferences.voiceInputMode !== 'continuous') return;
                if (continuousActive) void stopContinuousConversation();
                else void startContinuousConversation();
              }}
            >
              <MicrophoneIcon
                className="voice-microphone"
                size={17}
                weight={microphone.enabled ? 'bold' : 'regular'}
                aria-hidden="true"
              />
              <span className="voice-level" aria-hidden="true">
                {[0.72, 1, 0.84, 0.62, 0.46].map((weight, index) => (
                  <span
                    key={index}
                    className="voice-level-bar"
                    style={{ transform: `scaleY(${0.16 + microphoneLevel * weight * 0.84})` }}
                  />
                ))}
              </span>
              <span className="voice-label">
                {voiceButtonState === 'requesting'
                  ? agent.isPending
                    ? english
                      ? 'Waiting for Xiaoxiao'
                      : '等待晓晓'
                    : english
                      ? 'Switching'
                      : '正在切换'
                  : voiceButtonState === 'error'
                    ? copy.micUnavailable
                    : preferences.voiceInputMode === 'continuous'
                      ? continuousActive
                        ? copy.endContinuousConversation
                        : copy.continuousConversation
                      : microphone.enabled
                        ? copy.releaseToEnd
                        : copy.pressToTalk}
              </span>
            </button>
            <button
              type="button"
              className="voice-mode-menu-toggle"
              aria-label={english ? 'Change voice mode' : '切换语音模式'}
              aria-haspopup="menu"
              aria-expanded={voiceModeMenuOpen}
              disabled={voiceTransitioning}
              onClick={() => setVoiceModeMenuOpen((open) => !open)}
              title={english ? 'Change voice mode' : '切换语音模式'}
            >
              <CaretDownIcon size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`voice-channel-button ${voiceChannelActive ? 'is-connected' : 'is-disconnected'}`}
          aria-label={
            voiceChannelActive ? (english ? 'Disconnect voice' : '挂断语音连接') : copy.connectVoice
          }
          aria-pressed={voiceChannelActive}
          disabled={voiceTransitioning || starting}
          onClick={() => void (voiceChannelActive ? hangUpVoiceChannel() : connectVoiceChannel())}
          title={
            voiceChannelActive ? (english ? 'Disconnect voice' : '挂断语音连接') : copy.connectVoice
          }
        >
          {voiceChannelActive ? (
            <PhoneDisconnectIcon size={18} weight="bold" aria-hidden="true" />
          ) : (
            <PhoneCallIcon size={18} weight="bold" aria-hidden="true" />
          )}
        </button>
      </footer>
      {browserDialog === 'end-conversation' ? (
        <div className="browser-dialog-backdrop">
          <EndConversationDialog
            closing={closingConversation}
            english={english}
            onClose={() => setBrowserDialog(null)}
            onConfirm={() => void closeCurrentConversation()}
          />
        </div>
      ) : null}
    </main>
  );
};

type SourceCopy = {
  backToSources: string;
  browserBack: string;
  browserForward: string;
  close: string;
  closeWindow: string;
  currentZoom(percent: number): string;
  desktopReading: string;
  errorBlocked: string;
  httpError(statusCode?: number): string;
  errorNetwork: string;
  errorRenderer: string;
  errorTimeout: string;
  explore: string;
  exploreAdvice(firstTopic: string, secondTopic?: string): string;
  exploreResultCount(count: number): string;
  exploreEncyclopedia: string;
  exploreGuidance: string;
  exploreSuggestions: string;
  exploreSourcesUnavailable: string;
  exploreVideo: string;
  loadedPage: string;
  loadingOriginalPage: string;
  loadingPage: string;
  mobileReading: string;
  minimize: string;
  minimizeWindow: string;
  more: string;
  openExternal: string;
  pageLoadFailed: string;
  pageZoom: string;
  preparingSources: string;
  readingMode: string;
  resetZoom: string;
  retry: string;
  sourceFallback: string;
  sourceList: string;
  sourcePage: string;
  sourceCount(count: number): string;
  sources: string;
  reload: string;
  stop: string;
  zoomIn: string;
  zoomOut: string;
};

const getSourceCopy = (english: boolean): SourceCopy =>
  english
    ? {
        backToSources: 'Back to sources',
        browserBack: 'Back',
        browserForward: 'Forward',
        close: 'Close',
        closeWindow: 'Close source window',
        currentZoom: (percent) => `Current zoom ${percent}%. Click to reset to 100%.`,
        desktopReading: 'Desktop page',
        errorBlocked: 'This page tried to navigate to an unsupported address.',
        httpError: (statusCode) =>
          statusCode
            ? `The site returned HTTP ${statusCode}. The page cannot be displayed in the app.`
            : 'The page cannot be displayed in the app.',
        errorNetwork: 'The page could not be loaded because of a network error.',
        errorRenderer: 'The page renderer stopped unexpectedly. Try again.',
        errorTimeout:
          'The page did not show a first view within 15 seconds. Try again or open it in your system browser.',
        explore: 'Explore',
        exploreAdvice: (firstTopic, secondTopic) =>
          secondTopic
            ? `Start with ${firstTopic}, then use ${secondTopic} to broaden the view.`
            : `Start with ${firstTopic} to build a clear picture.`,
        exploreResultCount: (count) => `${count} sources selected for your route`,
        exploreEncyclopedia: 'Encyclopedia',
        exploreGuidance: 'Browsing suggestion',
        exploreSuggestions: 'Continue chatting',
        exploreSourcesUnavailable: 'Some selected sources are temporarily unavailable.',
        exploreVideo: 'Video',
        loadedPage: 'Original page loaded',
        loadingOriginalPage: 'Loading original page',
        loadingPage: 'Loading page',
        mobileReading: 'Mobile reading',
        minimize: 'Minimize',
        minimizeWindow: 'Minimize source window',
        more: 'More source actions',
        openExternal: 'Open in system browser',
        pageLoadFailed: "Couldn't open this page",
        pageZoom: 'Page zoom',
        preparingSources: 'Preparing sources…',
        readingMode: 'Page reading mode',
        resetZoom: 'Reset to 100%',
        retry: 'Try again',
        sourceFallback: 'Source',
        sourceList: 'Sources',
        sourcePage: 'Source page',
        sourceCount: (count) => `${count} source${count === 1 ? '' : 's'} available`,
        sources: 'Sources',
        reload: 'Reload page',
        stop: 'Stop loading',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
      }
    : {
        backToSources: '返回搜索来源',
        browserBack: '网页后退',
        browserForward: '网页前进',
        close: '关闭',
        closeWindow: '关闭来源窗口',
        currentZoom: (percent) => `当前缩放 ${percent}% ，点击恢复 100%`,
        errorBlocked: '该页面尝试跳转到不受支持的地址。',
        httpError: (statusCode) =>
          statusCode
            ? `网站返回了 HTTP ${statusCode}，页面无法在应用内显示。`
            : '页面无法在应用内显示。',
        errorNetwork: '网络加载失败，无法打开这个网页。',
        errorRenderer: '网页渲染进程意外退出，请重试。',
        errorTimeout: '网页在 15 秒内没有显示首屏，请重试或改用系统浏览器打开。',
        explore: '探索',
        exploreAdvice: (firstTopic, secondTopic) =>
          secondTopic
            ? `建议先从「${firstTopic}」开始，再通过「${secondTopic}」扩展了解。`
            : `建议先浏览「${firstTopic}」，建立整体认识。`,
        exploreResultCount: (count) => `已为你的探索路线整理 ${count} 个来源`,
        exploreEncyclopedia: '百科',
        exploreGuidance: '浏览建议',
        exploreSuggestions: '继续聊',
        exploreSourcesUnavailable: '部分已选来源暂时不可用。',
        exploreVideo: '视频',
        desktopReading: '桌面网页',
        loadedPage: '原始网页已加载',
        loadingOriginalPage: '正在加载原始页面',
        loadingPage: '正在加载网页',
        mobileReading: '移动阅读',
        minimize: '最小化',
        minimizeWindow: '最小化来源窗口',
        more: '更多网页操作',
        openExternal: '在系统浏览器打开',
        pageLoadFailed: '无法打开这个网页',
        pageZoom: '网页缩放',
        readingMode: '网页阅读模式',
        preparingSources: '正在准备来源预览…',
        resetZoom: '恢复 100%',
        retry: '重试',
        sourceFallback: '来源网页',
        sourceList: '搜索来源列表',
        sourcePage: '原始页面',
        sourceCount: (count) => `${count} 个可查看来源`,
        sources: '搜索来源',
        reload: '刷新网页',
        stop: '停止加载',
        zoomIn: '放大网页',
        zoomOut: '缩小网页',
      };

const getSourceErrorMessage = (
  state: Extract<SourceWindowState, { mode: 'error' }>,
  copy: SourceCopy,
) => {
  switch (state.error) {
    case 'timeout':
      return copy.errorTimeout;
    case 'blocked':
      return copy.errorBlocked;
    case 'http':
      return copy.httpError(state.statusCode);
    case 'renderer':
      return copy.errorRenderer;
    default:
      return copy.errorNetwork;
  }
};

const Source = () => {
  const [state, setState] = useState<SourceWindowState | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>(() => readPreferences().locale);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previewScrollTopRef = useRef(0);
  const english = locale === 'en-US';
  const copy = getSourceCopy(english);

  useEffect(() => {
    void window.desktop?.getSourceState().then((nextState) => {
      if (nextState) setState(nextState);
    });
    return window.desktop?.onSourceState(setState);
  }, []);

  useEffect(() => window.desktop?.onLocaleChanged(setLocale), []);

  useLayoutEffect(() => {
    if (state?.mode === 'preview' && listRef.current) {
      listRef.current.scrollTop = previewScrollTopRef.current;
    }
  }, [state?.mode]);

  const hostname =
    state && state.mode !== 'preview' ? new URL(state.currentUrl).hostname : undefined;
  const navigation = state && state.mode !== 'preview' ? state.navigation : undefined;
  const pageTitle =
    state && state.mode !== 'preview'
      ? navigation?.pageTitle || state.source.title || hostname
      : undefined;
  const canGoBack = state?.mode !== 'error' && navigation?.canGoBack === true;
  const canGoForward = state?.mode !== 'error' && navigation?.canGoForward === true;
  const pageIsLoading = state?.mode === 'loading' || navigation?.isLoading === true;
  const rememberListPosition = () => {
    previewScrollTopRef.current = listRef.current?.scrollTop ?? 0;
  };

  const pageZoomPercent = state && state.mode !== 'preview' ? state.pageZoomPercent : undefined;
  const canZoomOut = pageZoomPercent !== undefined && canZoomSourcePageOut(pageZoomPercent);
  const canZoomIn = pageZoomPercent !== undefined && canZoomSourcePageIn(pageZoomPercent);
  const adjustPageZoom = (action: 'in' | 'out' | 'reset') => {
    void window.desktop?.setSourcePageZoom(action);
  };
  const setReadingMode = (mode: 'mobile' | 'desktop') => {
    void window.desktop?.setSourceReadingMode(mode);
  };
  const navigateSource = (action: 'back' | 'forward' | 'reload' | 'stop') => {
    void window.desktop?.navigateSource(action);
  };
  const previewSources = state?.mode === 'preview' ? companionPreviewSources(state.preview) : [];
  const explorePreview =
    state?.mode === 'preview' && state.preview.type === 'explore.result'
      ? state.preview.result
      : null;
  const exploreCards = explorePreview?.topics.flatMap((topic) => topic.cards) ?? [];
  const exploreAdvice = explorePreview
    ? copy.exploreAdvice(explorePreview.topics[0]?.title ?? '', explorePreview.topics[1]?.title)
    : null;

  return (
    <main className="source-shell">
      <header className="source-bar drag-bar">
        {state && state.mode !== 'preview' ? (
          <button
            type="button"
            className="source-icon-button no-drag"
            aria-label={copy.backToSources}
            title={copy.backToSources}
            onClick={() => void window.desktop?.backToSources()}
          >
            <ArrowLeftIcon size={17} aria-hidden="true" />
          </button>
        ) : explorePreview ? (
          <CompassIcon size={17} color="#476eae" aria-hidden="true" />
        ) : (
          <MagnifyingGlassIcon size={17} color="#476eae" aria-hidden="true" />
        )}
        <span className="source-heading">
          <b>
            {state?.mode === 'preview'
              ? explorePreview
                ? copy.explore
                : copy.sources
              : (pageTitle ?? copy.sourceFallback)}
          </b>
          <small>
            {state?.mode === 'preview'
              ? copy.sourceCount(previewSources.length)
              : state?.mode === 'loading'
                ? copy.loadingOriginalPage
                : state?.mode === 'error'
                  ? copy.pageLoadFailed
                  : (hostname ?? copy.sourcePage)}
          </small>
        </span>
        {state && state.mode !== 'preview' ? (
          <>
            <div
              className="source-browser-controls no-drag"
              role="group"
              aria-label={copy.sourcePage}
            >
              <button
                type="button"
                className="source-icon-button"
                aria-label={copy.browserBack}
                title={copy.browserBack}
                disabled={!canGoBack}
                onClick={() => navigateSource('back')}
              >
                <CaretLeftIcon size={15} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="source-icon-button"
                aria-label={copy.browserForward}
                title={copy.browserForward}
                disabled={!canGoForward}
                onClick={() => navigateSource('forward')}
              >
                <CaretRightIcon size={15} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="source-icon-button"
                aria-label={pageIsLoading ? copy.stop : copy.reload}
                title={pageIsLoading ? copy.stop : copy.reload}
                onClick={() => navigateSource(pageIsLoading ? 'stop' : 'reload')}
              >
                {pageIsLoading ? (
                  <StopIcon size={14} weight="fill" aria-hidden="true" />
                ) : (
                  <ArrowClockwiseIcon size={15} weight="bold" aria-hidden="true" />
                )}
              </button>
            </div>
            <div
              className="source-reading-controls no-drag"
              role="group"
              aria-label={copy.readingMode}
            >
              <button
                type="button"
                className="source-reading-mode"
                aria-label={copy.mobileReading}
                title={copy.mobileReading}
                aria-pressed={state.readingMode === 'mobile'}
                onClick={() => setReadingMode('mobile')}
              >
                <DeviceMobileIcon size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="source-reading-mode"
                aria-label={copy.desktopReading}
                title={copy.desktopReading}
                aria-pressed={state.readingMode === 'desktop'}
                onClick={() => setReadingMode('desktop')}
              >
                <DesktopIcon size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="source-zoom-controls no-drag" role="group" aria-label={copy.pageZoom}>
              <button
                type="button"
                className="source-icon-button"
                aria-label={copy.zoomOut}
                title={copy.zoomOut}
                disabled={!canZoomOut}
                onClick={() => adjustPageZoom('out')}
              >
                <MinusIcon size={15} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="source-zoom-percent"
                aria-label={copy.currentZoom(pageZoomPercent ?? 100)}
                title={copy.resetZoom}
                onClick={() => adjustPageZoom('reset')}
              >
                {pageZoomPercent ?? 100}%
              </button>
              <button
                type="button"
                className="source-icon-button"
                aria-label={copy.zoomIn}
                title={copy.zoomIn}
                disabled={!canZoomIn}
                onClick={() => adjustPageZoom('in')}
              >
                <PlusIcon size={15} weight="bold" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="source-icon-button source-external-button no-drag"
              aria-label={copy.openExternal}
              title={copy.openExternal}
              onClick={() => void window.desktop?.openCurrentSourceExternal()}
            >
              <ArrowSquareOutIcon size={16} aria-hidden="true" />
            </button>
            <div className="source-more-wrap no-drag">
              <button
                type="button"
                className="source-icon-button"
                aria-label={copy.more}
                title={copy.more}
                aria-haspopup="menu"
                onMouseDown={(event) => {
                  event.preventDefault();
                  void window.desktop?.showSourceMoreMenu();
                }}
                onClick={(event) => {
                  if (event.detail === 0) void window.desktop?.showSourceMoreMenu();
                }}
              >
                <DotsThreeIcon size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
        <div className="source-window-actions no-drag">
          <button
            type="button"
            className="source-icon-button"
            aria-label={copy.minimizeWindow}
            title={copy.minimize}
            onClick={() => void window.desktop?.minimizeSource()}
          >
            <MinusIcon size={16} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="source-icon-button"
            aria-label={copy.closeWindow}
            title={copy.close}
            onClick={() => void window.desktop?.closeSource()}
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {!state ? (
        <div className="source-status" role="status">
          <CircleNotchIcon className="source-spinner" size={22} aria-hidden="true" />
          <span>{copy.preparingSources}</span>
        </div>
      ) : state.mode === 'preview' ? (
        <div
          ref={listRef}
          className="source-results"
          onScroll={rememberListPosition}
          aria-label={copy.sourceList}
        >
          {state.preview.type === 'guide.sources' && state.preview.query ? (
            <p className="source-query source-query--context">“{state.preview.query}”</p>
          ) : null}
          {explorePreview ? (
            <section className="explore-route" aria-label={copy.exploreGuidance}>
              <div className="explore-route-heading">
                <span className="explore-guidance-title">
                  <SparkleIcon size={15} weight="fill" aria-hidden="true" />
                  <b>{copy.exploreGuidance}</b>
                </span>
                <small>{copy.exploreResultCount(exploreCards.length)}</small>
              </div>
              <p>{exploreAdvice}</p>
              <div className="explore-suggestions">
                <b>{copy.exploreSuggestions}</b>
                {explorePreview.suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => window.desktop?.prefillExploreSuggestion(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {explorePreview
            ? explorePreview.topics.map((topic) => (
                <section className="explore-topic-group" key={topic.id} aria-label={topic.title}>
                  <div className="explore-topic-heading">
                    <b>{topic.title}</b>
                    <small>{topic.reason}</small>
                  </div>
                  {topic.cards.map((card) => (
                    <button
                      type="button"
                      className="source-result source-result--explore no-drag"
                      key={card.id}
                      onClick={() => {
                        rememberListPosition();
                        void window.desktop?.selectSource(card.url);
                      }}
                    >
                      <span className="source-result-meta">
                        <span
                          className={`source-result-type source-result-type--${card.kind}`}
                          aria-hidden="true"
                        >
                          {card.kind === 'video' ? (
                            <VideoCameraIcon size={11} weight="fill" />
                          ) : (
                            <BookOpenIcon size={11} weight="fill" />
                          )}
                        </span>
                        <b>{card.siteName}</b>
                        {card.publishTime ? <time>{card.publishTime.slice(0, 10)}</time> : null}
                        <i className="explore-source-kind">
                          {card.sourceType === 'search_page'
                            ? card.kind === 'video'
                              ? english
                                ? 'Platform search'
                                : '站内搜索'
                              : english
                                ? 'Search page'
                                : '搜索页'
                            : card.kind === 'video'
                              ? copy.exploreVideo
                              : copy.exploreEncyclopedia}
                        </i>
                      </span>
                      <span className="source-result-body">
                        <span>
                          <strong>{card.title}</strong>
                          {card.summary ? <small>{card.summary}</small> : null}
                        </span>
                        {card.thumbnailUrl ? <img src={card.thumbnailUrl} alt="" /> : null}
                      </span>
                    </button>
                  ))}
                </section>
              ))
            : previewSources.map((source) => (
                <button
                  type="button"
                  className="source-result no-drag"
                  key={source.url}
                  onClick={() => {
                    rememberListPosition();
                    void window.desktop?.selectSource(source.url);
                  }}
                >
                  <span className="source-result-meta">
                    {source.iconUrl ? (
                      <img
                        src={source.iconUrl}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span>{copy.sourceFallback.slice(0, 1)}</span>
                    )}
                    <b>{source.siteName}</b>
                    {source.publishTime ? <time>{source.publishTime.slice(0, 10)}</time> : null}
                  </span>
                  <span className="source-result-body">
                    <span>
                      <strong>{source.title}</strong>
                      {source.summary ? <small>{source.summary}</small> : null}
                    </span>
                    {source.thumbnailUrl ? (
                      <img
                        src={source.thumbnailUrl}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : null}
                  </span>
                </button>
              ))}
          {explorePreview?.unavailableProviders.length ? (
            <p className="source-query">{copy.exploreSourcesUnavailable}</p>
          ) : null}
        </div>
      ) : state.mode === 'error' ? (
        <div className="source-error" role="alert">
          <WarningCircleIcon size={30} weight="duotone" aria-hidden="true" />
          <strong>{copy.pageLoadFailed}</strong>
          <span>{state.source.title}</span>
          <p>{getSourceErrorMessage(state, copy)}</p>
          <small>{state.currentUrl}</small>
          <div>
            <button type="button" onClick={() => void window.desktop?.retrySource()}>
              {copy.retry}
            </button>
            <button type="button" onClick={() => void window.desktop?.openCurrentSourceExternal()}>
              {copy.openExternal}
            </button>
            <button type="button" onClick={() => void window.desktop?.backToSources()}>
              {copy.backToSources}
            </button>
          </div>
        </div>
      ) : state.mode === 'loading' ? (
        <div className="source-status" role="status">
          <CircleNotchIcon className="source-spinner" size={24} aria-hidden="true" />
          <strong>{copy.loadingPage}</strong>
          <span>{state.source.title}</span>
          <span>{hostname}</span>
        </div>
      ) : (
        <div className="source-remote-placeholder" aria-label={copy.loadedPage} />
      )}
    </main>
  );
};

const SourceMoreMenuRoute = () => {
  const [state, setState] = useState<SourceMoreMenuState | null>(null);

  useEffect(() => {
    document.body.classList.add('source-more-menu-body');
    void window.desktop?.getSourceMoreMenuState().then(setState);
    const unsubscribe = window.desktop?.onSourceMoreMenuState(setState);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.desktop?.closeSourceMoreMenu();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('source-more-menu-body');
      document.removeEventListener('keydown', closeOnEscape);
      unsubscribe?.();
    };
  }, []);

  if (!state) return <main className="source-more-menu-root" />;
  const copy = getSourceCopy(state.locale === 'en-US');
  const perform = (action: SourceMoreMenuAction) =>
    void window.desktop?.performSourceMoreMenuAction(action);

  return (
    <main className="source-more-menu-root">
      <div className="source-more-menu" role="menu" aria-label={copy.more}>
        <div className="source-more-menu-section">
          <button
            type="button"
            className="source-more-menu-item"
            role="menuitemradio"
            aria-checked={state.readingMode === 'mobile'}
            onClick={() => perform('mobile')}
          >
            <DeviceMobileIcon size={16} aria-hidden="true" />
            <span>{copy.mobileReading}</span>
            {state.readingMode === 'mobile' ? <CheckIcon size={15} aria-hidden="true" /> : null}
          </button>
          <button
            type="button"
            className="source-more-menu-item"
            role="menuitemradio"
            aria-checked={state.readingMode === 'desktop'}
            onClick={() => perform('desktop')}
          >
            <DesktopIcon size={16} aria-hidden="true" />
            <span>{copy.desktopReading}</span>
            {state.readingMode === 'desktop' ? <CheckIcon size={15} aria-hidden="true" /> : null}
          </button>
        </div>
        <div className="source-more-menu-section">
          <button
            type="button"
            className="source-more-menu-item"
            role="menuitem"
            disabled={!state.canZoomOut}
            onClick={() => perform('zoom-out')}
          >
            <MinusIcon size={16} weight="bold" aria-hidden="true" />
            <span>{copy.zoomOut}</span>
          </button>
          <button
            type="button"
            className="source-more-menu-item"
            role="menuitem"
            onClick={() => perform('zoom-reset')}
          >
            <span className="source-more-menu-zoom">{state.pageZoomPercent}%</span>
            <span>{copy.resetZoom}</span>
          </button>
          <button
            type="button"
            className="source-more-menu-item"
            role="menuitem"
            disabled={!state.canZoomIn}
            onClick={() => perform('zoom-in')}
          >
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            <span>{copy.zoomIn}</span>
          </button>
        </div>
        <div className="source-more-menu-section">
          <button
            type="button"
            className="source-more-menu-item"
            role="menuitem"
            onClick={() => perform('open-external')}
          >
            <ArrowSquareOutIcon size={16} aria-hidden="true" />
            <span>{copy.openExternal}</span>
          </button>
        </div>
      </div>
    </main>
  );
};

const SettingsRoute = () => {
  const { preferences, savePreferences } = usePreferences();
  return (
    <div className="utility-root">
      <SettingsDialog
        preferences={preferences}
        savePreferences={savePreferences}
        onClose={() => void window.desktop?.closeUtilityWindow()}
      />
    </div>
  );
};

const QuitRoute = () => (
  <div className="utility-root">
    <QuitDialog onClose={() => void window.desktop?.closeUtilityWindow()} />
  </div>
);

const route = location.hash;
const content =
  route === '#source' ? (
    <Source />
  ) : route === '#source-menu' ? (
    <SourceMoreMenuRoute />
  ) : route === '#settings' ? (
    <SettingsRoute />
  ) : route === '#quit' ? (
    <QuitRoute />
  ) : (
    <Assistant />
  );

createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>);
