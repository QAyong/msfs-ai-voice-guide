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
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp';
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
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
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { WaveformIcon } from '@phosphor-icons/react/dist/csr/Waveform';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { DesktopReadiness } from '../../../shared/desktop-contracts.js';
import type { AboutInfo, AboutLinkId, AboutSupportChannel } from '../../../shared/about-info.js';
import {
  defaultDesktopServiceSettings,
  serviceCheckRequestSchema,
  serviceSettingsSaveRequestSchema,
  type DesktopServiceSettings,
  type ServiceCheckResult,
  type ServiceCheckTarget,
  type ServiceSettingsSaveRequest,
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
import type { SourceWindowState } from '../../../shared/source-preview.js';
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
import { resolveVoiceStatus } from './voice-ui-state.js';
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
  interfaceMotion: boolean;
  voiceInputMode: VoiceInputMode;
  globalPushToTalkKey: string;
};

const defaultPreferences: Preferences = {
  locale: 'zh-CN',
  alwaysOnTop: true,
  agentVolume: 0.85,
  openSourcesInApp: true,
  interfaceMotion: true,
  voiceInputMode: 'push_to_talk',
  globalPushToTalkKey: 'AltLeft',
};

const readPreferences = (): Preferences => {
  try {
    const saved = localStorage.getItem(preferenceStorageKey);
    if (!saved) return defaultPreferences;
    const parsed = { ...defaultPreferences, ...JSON.parse(saved) } as Preferences;
    return {
      ...parsed,
      agentVolume: Math.min(1, Math.max(0, Number(parsed.agentVolume) || 0)),
      locale: parsed.locale === 'en-US' ? 'en-US' : 'zh-CN',
      voiceInputMode: isVoiceInputMode(parsed.voiceInputMode)
        ? parsed.voiceInputMode
        : defaultPreferences.voiceInputMode,
      globalPushToTalkKey: isGlobalPushToTalkKey(parsed.globalPushToTalkKey)
        ? parsed.globalPushToTalkKey
        : defaultPreferences.globalPushToTalkKey,
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

type ServiceCredentials = {
  deepseekApiKey: string;
  sttAppId: string;
  sttAccessToken: string;
  ttsAppId: string;
  ttsAccessToken: string;
  searchApiKey: string;
};
type ServiceCredentialStatus = {
  encryptionAvailable: boolean;
  configured: Record<keyof ServiceCredentials, boolean>;
  error?: string;
};
type ServiceTestState = { checking: boolean; result?: ServiceCheckResult };

const defaultServiceSettings: ServiceSettings = defaultDesktopServiceSettings;

const defaultServiceCredentials: ServiceCredentials = {
  deepseekApiKey: '',
  sttAppId: '',
  sttAccessToken: '',
  ttsAppId: '',
  ttsAccessToken: '',
  searchApiKey: '',
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
    ServiceSettingsSaveRequest['credentials']
  >({});
  const [credentialStatus, setCredentialStatus] = useState<ServiceCredentialStatus>(
    defaultServiceCredentialStatus,
  );
  const [serviceTests, setServiceTests] = useState<
    Partial<Record<ServiceCheckTarget, ServiceTestState>>
  >({});
  const [voiceCredentialsLinked, setVoiceCredentialsLinked] = useState(true);
  const [notice, setNotice] = useState('');
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
  useEffect(
    () =>
      window.desktop?.onServiceTransitionResult((result) => {
        setNotice(result.message);
        if (!result.ok) return;
        setCredentialUpdates({});
        void window.desktop?.getServiceCredentialStatus().then((status) => {
          if (status) setCredentialStatus(status as ServiceCredentialStatus);
        });
      }),
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
  const saveGeneral = async () => {
    if (!isGlobalPushToTalkKey(draft.globalPushToTalkKey)) {
      setNotice(
        english
          ? 'Choose one supported global push-to-talk key.'
          : '请选择一个支持的全局按住说话键。',
      );
      return;
    }
    savePreferences(draft);
    const result = await window.desktop?.saveLocale(draft.locale);
    if (result && !result.ok) {
      savePreferences(preferences);
      setNotice(result.readiness.message);
      return;
    }
    setNotice('saved');
  };
  const saveServices = async () => {
    if (window.desktop) {
      const parsed = serviceSettingsSaveRequestSchema.safeParse({
        services,
        credentials: credentialUpdates,
      });
      if (!parsed.success) {
        setNotice(
          english ? 'Check the service endpoint and numeric values.' : '请检查服务地址和数值。',
        );
        return;
      }
      const result = await window.desktop.saveServiceSettings(parsed.data);
      setNotice(
        !result.ok
          ? result.readiness.message
          : english
            ? 'Candidate service is ready. Reconnecting the guide…'
            : '候选服务已就绪，正在重新连接导游…',
      );
      return;
    }
    setNotice(
      english
        ? 'Non-secret service fields saved. Credentials require the desktop app to be encrypted.'
        : '非敏感服务参数已保存。凭据需要在桌面应用中加密保存。',
    );
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
  const searchConfigured = credentialStatus.configured.searchApiKey || credentials.searchApiKey;

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
                <span>{english ? 'Display language' : '显示语言'}</span>
                <select
                  value={draft.locale}
                  onChange={(event) => updateDraft('locale', event.target.value as SupportedLocale)}
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
                    ? 'Set up the three services your guide needs. You can change advanced values when needed.'
                    : '只需完成导游真正需要的三项服务；高级参数可按需展开。'}
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
                <ServiceField
                  label={english ? 'TTS speaker' : '豆包 TTS 音色'}
                  value={services.tts.speaker}
                  onChange={(value) =>
                    setServices((current) => ({
                      ...current,
                      tts: { ...current.tts, speaker: value },
                    }))
                  }
                />
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
                <ServiceField
                  label={english ? 'API Key (optional)' : 'API Key（可选）'}
                  configured={credentialStatus.configured.searchApiKey}
                  type="password"
                  value={credentials.searchApiKey}
                  onChange={(value) => updateCredential('searchApiKey', value)}
                />
                <details className="service-advanced no-drag">
                  <summary>{english ? 'Advanced settings' : '高级设置'}</summary>
                  <ServiceField
                    label="HTTPS endpoint"
                    value={services.search.endpoint}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        search: { ...current.search, endpoint: value },
                      }))
                    }
                  />
                  <ServiceField
                    label={english ? 'Timeout (ms)' : '超时（毫秒）'}
                    type="number"
                    value={String(services.search.timeoutMs)}
                    onChange={(value) =>
                      setServices((current) => ({
                        ...current,
                        search: { ...current.search, timeoutMs: Number(value) },
                      }))
                    }
                  />
                </details>
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
            {(notice === 'saved' ? copy.saved : notice) ||
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
            className="done-button no-drag"
            onClick={activeTab === 'general' ? saveGeneral : saveServices}
          >
            {activeTab === 'general' ? copy.save : copy.saveReconnect}
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

type AssistantViewProps = {
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

  useEffect(() => {
    void startSession();
    return () => {
      connectAbortRef.current?.abort();
      void sessionRef.current.end();
    };
  }, [startSession]);

  useEffect(
    () =>
      window.desktop?.onServiceReconnectNeeded((transitionId) => {
        void (async () => {
          const connected = await startSession();
          if (connected) {
            const result = await window.desktop?.completeServiceReconnect(transitionId);
            if (result?.ok) return;
          }
          await window.desktop?.rollbackServiceReconnect(transitionId);
          await startSession();
        })();
      }),
    [startSession],
  );

  return (
    <SessionProvider session={session}>
      <RoomAudioRenderer volume={voiceChannelConnected ? preferences.agentVolume : 0} />
      <AssistantView
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
  const [browserDialog, setBrowserDialog] = useState<UtilityDialog | null>(null);
  const [voiceTransitioning, setVoiceTransitioning] = useState(false);
  const [controlError, setControlError] = useState('');
  const [microphoneError, setMicrophoneError] = useState('');
  const [textComposerOpen, setTextComposerOpen] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [textInputError, setTextInputError] = useState('');
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
        enterText: 'Type a message, Enter to send',
        inputAfterConnection: 'Connect Xiaoxiao to type a message',
        messageInput: 'Text input',
        micUnavailable: 'Microphone unavailable',
        name: 'Xiaoxiao',
        newMessages: 'New messages',
        openConfiguration: 'Open configuration file',
        pressToTalk: 'Hold to talk',
        recentConversation: 'Recent conversation',
        reconnect: 'Retry',
        releaseToEnd: 'Release to finish',
        sourceCount: (count: number) => `${count} web sources found`,
        text: 'Text',
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
        enterText: '输入文字，Enter 发送',
        inputAfterConnection: '连接晓晓后即可输入文字',
        messageInput: '文字输入',
        micUnavailable: '麦克风不可用',
        name: '晓晓',
        newMessages: '新消息',
        openConfiguration: '打开配置文件',
        pressToTalk: '按住说话',
        recentConversation: '最近对话',
        reconnect: '重新检测',
        releaseToEnd: '松开结束',
        sourceCount: (count: number) => `已检索 ${count} 个网页来源`,
        text: '文字',
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

  const statusLabel = resolveVoiceStatus({
    agentState: agent.state,
    connectionState: session.connectionState,
    continuousActive,
    hasError: Boolean(errorMessage),
    locale: preferences.locale,
    starting,
    ...(toolActivity ? { toolActivity } : {}),
    ...(userState ? { userState } : {}),
  });
  const setupBlocked =
    Boolean(startupError) ||
    Boolean(readiness) ||
    agent.state === 'failed' ||
    (!starting && session.connectionState === ConnectionState.Disconnected);
  const voiceChannelActive = voiceChannelConnected && !setupBlocked;
  const interactionBlocked = setupBlocked || !agent.canListen || !voiceChannelConnected;
  const textInputBlocked = setupBlocked || !agent.isConnected;
  const visibleStatusLabel =
    !voiceChannelConnected && !setupBlocked ? copy.voiceDisconnected : statusLabel;
  const avatarExpression = resolveGuideAvatarExpression({
    agentState: agent.state,
    connectionState: session.connectionState,
    hasError: Boolean(errorMessage) || !voiceChannelConnected,
    usedToolsInTurn,
    ...(toolActivity ? { toolActivity } : {}),
    ...(userState ? { userState } : {}),
  });
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
    if (!next) await closeMenu();
    setCollapsed(next);
    await window.desktop?.setCollapsed(next);
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
            ) : (
              <QuitDialog onClose={() => setBrowserDialog(null)} />
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="assistant-card">
      <header className="drag-bar">
        <GuideExpression state={avatarExpression} />
        <span className="name">{copy.name}</span>
        <span
          className={`status status--${session.connectionState} ${!voiceChannelConnected && !setupBlocked ? 'status--voice-disconnected' : ''}`}
          title={errorMessage || undefined}
        >
          {visibleStatusLabel}
        </span>
        <button className="text-button no-drag" onClick={() => void changeCollapsed(true)}>
          {copy.collapse}
        </button>
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
            displayMessages.map((message) =>
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
            )
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
    </main>
  );
};

type SourceCopy = {
  backToSources: string;
  close: string;
  closeWindow: string;
  currentZoom(percent: number): string;
  errorBlocked: string;
  httpError(statusCode?: number): string;
  errorNetwork: string;
  errorRenderer: string;
  errorTimeout: string;
  loadedPage: string;
  loadingOriginalPage: string;
  loadingPage: string;
  openExternal: string;
  pageLoadFailed: string;
  pageZoom: string;
  preparingSources: string;
  resetZoom: string;
  retry: string;
  sourceFallback: string;
  sourceList: string;
  sourcePage: string;
  sourceCount(count: number): string;
  sources: string;
  zoomIn: string;
  zoomOut: string;
};

const getSourceCopy = (english: boolean): SourceCopy =>
  english
    ? {
        backToSources: 'Back to sources',
        close: 'Close',
        closeWindow: 'Close source window',
        currentZoom: (percent) => `Current zoom ${percent}%. Click to reset to 100%.`,
        errorBlocked: 'This page tried to navigate to an unsupported address.',
        httpError: (statusCode) =>
          statusCode
            ? `The site returned HTTP ${statusCode}. The page cannot be displayed in the app.`
            : 'The page cannot be displayed in the app.',
        errorNetwork: 'The page could not be loaded because of a network error.',
        errorRenderer: 'The page renderer stopped unexpectedly. Try again.',
        errorTimeout:
          'The page did not show a first view within 15 seconds. Try again or open it in your system browser.',
        loadedPage: 'Original page loaded',
        loadingOriginalPage: 'Loading original page',
        loadingPage: 'Loading page',
        openExternal: 'Open in system browser',
        pageLoadFailed: "Couldn't open this page",
        pageZoom: 'Page zoom',
        preparingSources: 'Preparing sources…',
        resetZoom: 'Reset to 100%',
        retry: 'Try again',
        sourceFallback: 'Source',
        sourceList: 'Sources',
        sourcePage: 'Source page',
        sourceCount: (count) => `${count} source${count === 1 ? '' : 's'} available`,
        sources: 'Sources',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
      }
    : {
        backToSources: '返回搜索来源',
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
        loadedPage: '原始网页已加载',
        loadingOriginalPage: '正在加载原始页面',
        loadingPage: '正在加载网页',
        openExternal: '在系统浏览器打开',
        pageLoadFailed: '无法打开这个网页',
        pageZoom: '网页缩放',
        preparingSources: '正在准备来源预览…',
        resetZoom: '恢复 100%',
        retry: '重试',
        sourceFallback: '来源网页',
        sourceList: '搜索来源列表',
        sourcePage: '原始页面',
        sourceCount: (count) => `${count} 个可查看来源`,
        sources: '搜索来源',
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
  const rememberListPosition = () => {
    previewScrollTopRef.current = listRef.current?.scrollTop ?? 0;
  };

  const pageZoomPercent = state && state.mode !== 'preview' ? state.pageZoomPercent : undefined;
  const canZoomOut = pageZoomPercent !== undefined && canZoomSourcePageOut(pageZoomPercent);
  const canZoomIn = pageZoomPercent !== undefined && canZoomSourcePageIn(pageZoomPercent);
  const adjustPageZoom = (action: 'in' | 'out' | 'reset') => {
    void window.desktop?.setSourcePageZoom(action);
  };

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
        ) : (
          <MagnifyingGlassIcon size={17} color="#476eae" aria-hidden="true" />
        )}
        <span className="source-heading">
          <b>{state?.mode === 'preview' ? copy.sources : (hostname ?? copy.sourceFallback)}</b>
          <small>
            {state?.mode === 'preview'
              ? copy.sourceCount(state.preview.sources.length)
              : state?.mode === 'loading'
                ? copy.loadingOriginalPage
                : state?.mode === 'error'
                  ? copy.pageLoadFailed
                  : copy.sourcePage}
          </small>
        </span>
        {state && state.mode !== 'preview' ? (
          <>
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
              className="source-icon-button no-drag"
              aria-label={copy.openExternal}
              title={copy.openExternal}
              onClick={() => void window.desktop?.openCurrentSourceExternal()}
            >
              <ArrowSquareOutIcon size={16} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <button
          className="source-icon-button no-drag"
          aria-label={copy.closeWindow}
          title={copy.close}
          onClick={() => void window.desktop?.closeSource()}
        >
          <XIcon size={16} aria-hidden="true" />
        </button>
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
          {state.preview.query ? <p className="source-query">“{state.preview.query}”</p> : null}
          {state.preview.sources.map((source) => (
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
  ) : route === '#settings' ? (
    <SettingsRoute />
  ) : route === '#quit' ? (
    <QuitRoute />
  ) : (
    <Assistant />
  );

createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>);
