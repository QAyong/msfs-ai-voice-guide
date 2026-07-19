import {
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
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
import { DesktopIcon } from '@phosphor-icons/react/dist/csr/Desktop';
import { DeviceTabletIcon } from '@phosphor-icons/react/dist/csr/DeviceTablet';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { KeyboardIcon } from '@phosphor-icons/react/dist/csr/Keyboard';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt';
import { PhoneCallIcon } from '@phosphor-icons/react/dist/csr/PhoneCall';
import { PhoneDisconnectIcon } from '@phosphor-icons/react/dist/csr/PhoneDisconnect';
import { PowerIcon } from '@phosphor-icons/react/dist/csr/Power';
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/csr/SpeakerHigh';
import { SparkleIcon } from '@phosphor-icons/react/dist/csr/Sparkle';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { WaveformIcon } from '@phosphor-icons/react/dist/csr/Waveform';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { DesktopReadiness } from '../../../shared/desktop-contracts.js';
import {
  guideSourcesTopic,
  parseGuideSourcesMessage,
  type GuideSourcesMessage,
} from '../../../shared/guide-events.js';
import type { SourceWindowState } from '../../../shared/source-preview.js';
import {
  guideVoiceAttributes,
  guideVoiceRpc,
  isGuideUserState,
  isVoiceInputMode,
  type GuideVoiceRpcMethod,
  type VoiceInputMode,
} from '../../../shared/voice-control.js';
import { resolveVoiceStatus } from './voice-ui-state.js';
import { MessageMarkdown } from './message-markdown.js';
import { createDisplayMessages, shouldAttachSourcePreview } from './session-messages.js';
import './style.css';

const preferenceStorageKey = 'cloudpath-guide-preferences';

type MenuDirection = 'up' | 'down';
type UtilityDialog = 'settings' | 'quit';

type Preferences = {
  alwaysOnTop: boolean;
  agentVolume: number;
  openSourcesInApp: boolean;
  interfaceMotion: boolean;
  voiceInputMode: VoiceInputMode;
};

const defaultPreferences: Preferences = {
  alwaysOnTop: true,
  agentVolume: 0.85,
  openSourcesInApp: true,
  interfaceMotion: true,
  voiceInputMode: 'push_to_talk',
};

const readPreferences = (): Preferences => {
  try {
    const saved = localStorage.getItem(preferenceStorageKey);
    if (!saved) return defaultPreferences;
    const parsed = { ...defaultPreferences, ...JSON.parse(saved) } as Preferences;
    return {
      ...parsed,
      agentVolume: Math.min(1, Math.max(0, Number(parsed.agentVolume) || 0)),
      voiceInputMode: isVoiceInputMode(parsed.voiceInputMode)
        ? parsed.voiceInputMode
        : defaultPreferences.voiceInputMode,
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
    void window.desktop?.setAlwaysOnTop(preferences.alwaysOnTop);
  }, [preferences.alwaysOnTop, preferences.interfaceMotion]);

  const updatePreference = <Key extends keyof Preferences>(key: Key, value: Preferences[Key]) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      localStorage.setItem(preferenceStorageKey, JSON.stringify(next));
      return next;
    });
  };

  return { preferences, updatePreference };
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

type SettingsDialogProps = {
  onClose(): void;
  preferences: Preferences;
  updatePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void;
};

const SettingsDialog = ({ onClose, preferences, updatePreference }: SettingsDialogProps) => (
  <main className="utility-card settings-dialog" role="dialog" aria-modal="true">
    <header className="utility-header drag-region">
      <span className="utility-heading-icon" aria-hidden="true">
        <GearSixIcon size={18} weight="duotone" />
      </span>
      <span>
        <strong>偏好设置</strong>
        <small>调整悬浮助手的显示方式</small>
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
    <section className="preferences" aria-label="应用偏好">
      <PreferenceRow
        checked={preferences.alwaysOnTop}
        description="飞行时让助手保持在其他窗口上方"
        icon={<PushPinIcon size={18} weight="duotone" />}
        label="始终置顶"
        onChange={(checked) => updatePreference('alwaysOnTop', checked)}
      />
      <div className="preference-row preference-row--volume">
        <span className="preference-icon" aria-hidden="true">
          <SpeakerHighIcon size={18} weight="duotone" />
        </span>
        <span className="preference-copy">
          <strong>回答音量</strong>
          <small>{Math.round(preferences.agentVolume * 100)}%</small>
        </span>
        <input
          className="volume-slider"
          type="range"
          min="0"
          max="100"
          value={Math.round(preferences.agentVolume * 100)}
          aria-label="回答音量"
          onChange={(event) => updatePreference('agentVolume', Number(event.target.value) / 100)}
        />
      </div>
      <PreferenceRow
        checked={preferences.openSourcesInApp}
        description="使用伴随窗口查看回答引用的网页"
        icon={<BrowserIcon size={18} weight="duotone" />}
        label="应用内打开来源"
        onChange={(checked) => updatePreference('openSourcesInApp', checked)}
      />
      <PreferenceRow
        checked={preferences.interfaceMotion}
        description="保留菜单弹出和状态切换的轻微动效"
        icon={<SparkleIcon size={18} weight="duotone" />}
        label="界面动效"
        onChange={(checked) => updatePreference('interfaceMotion', checked)}
      />
    </section>
    <footer className="settings-footer">
      <span>修改会自动保存</span>
      <button type="button" className="done-button" onClick={onClose}>
        完成
      </button>
    </footer>
  </main>
);

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
  retry(): Promise<void>;
  session: UseSessionReturn;
  starting: boolean;
  startupError: string;
  updatePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void;
  voiceChannelConnected: boolean;
};

const maximumTextMessageLength = 4000;

const Assistant = () => {
  const { preferences, updatePreference } = usePreferences();
  const [readiness, setReadiness] = useState<DesktopReadiness | null>(null);
  const [starting, setStarting] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [voiceChannelConnected, setVoiceChannelConnected] = useState(true);
  const connectAbortRef = useRef<AbortController | null>(null);

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
    } catch (error) {
      if (!controller.signal.aborted) {
        setStartupError(error instanceof Error ? error.message : '语音服务连接失败');
      }
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

  return (
    <SessionProvider session={session}>
      <RoomAudioRenderer volume={voiceChannelConnected ? preferences.agentVolume : 0} />
      <AssistantView
        onVoiceChannelChange={setVoiceChannelConnected}
        preferences={preferences}
        readiness={readiness}
        retry={startSession}
        session={session}
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
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const agent = useAgent();
  const { isSending: isSendingText, messages, send: sendText } = useSessionMessages();
  const { perform } = useRpc();

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
  const errorMessage = microphoneError || controlError || startupError || agentFailure;
  const userStateValue = agent.attributes[guideVoiceAttributes.userState];
  const userState = isGuideUserState(userStateValue) ? userStateValue : undefined;
  const statusLabel = resolveVoiceStatus({
    agentState: agent.state,
    connectionState: session.connectionState,
    continuousActive,
    hasError: Boolean(errorMessage),
    starting,
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
  const visibleStatusLabel = !voiceChannelConnected && !setupBlocked ? '语音已挂断' : statusLabel;
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
      if (kind === 'settings') await window.desktop.openSettings();
      else await window.desktop.openQuitDialog();
      return;
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
            aria-label="展开云迹导游"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="点击展开云迹导游"
          >
            <span className="ball-avatar" aria-hidden="true">
              云
            </span>
          </button>
          <div className="ball-drag-handle drag-region" title="按住这里拖动悬浮球">
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
            aria-label="打开设置"
            title="设置"
            tabIndex={menuOpen ? 0 : -1}
            onClick={() => void openUtility('settings')}
          >
            <GearSixIcon size={19} weight="regular" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ball-menu-button ball-menu-button--danger"
            role="menuitem"
            aria-label="退出应用"
            title="退出应用"
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
                updatePreference={updatePreference}
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
        <span className="avatar">云</span>
        <span className="name">云迹导游</span>
        <span
          className={`status status--${session.connectionState} ${!voiceChannelConnected && !setupBlocked ? 'status--voice-disconnected' : ''}`}
          title={errorMessage || undefined}
        >
          {visibleStatusLabel}
        </span>
        <button className="text-button no-drag" onClick={() => void changeCollapsed(true)}>
          收起
        </button>
      </header>
      <div className="messages-shell">
        <section
          ref={messagesRef}
          className="messages"
          aria-label="最近对话"
          aria-live="polite"
          onScroll={updateMessageScrollPosition}
          onWheel={() => {
            programmaticMessageScrollRef.current = false;
          }}
        >
          {setupBlocked ? (
            <div className="readiness-card" role="status">
              <WarningCircleIcon size={24} weight="duotone" aria-hidden="true" />
              <strong>{readiness?.message ?? errorMessage ?? '语音服务暂时不可用'}</strong>
              {(readiness?.issues ?? agent.failureReasons ?? []).slice(0, 4).map((issue) => (
                <small key={issue}>{issue}</small>
              ))}
              <div className="readiness-actions">
                {readiness?.status === 'setup_required' ? (
                  <button type="button" onClick={() => void window.desktop?.openConfiguration()}>
                    打开配置文件
                  </button>
                ) : null}
                <button type="button" onClick={() => void retry()}>
                  重新检测
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
                  ? '语音已挂断'
                  : session.isConnected
                    ? '可以开始对话了'
                    : '正在准备语音导游'}
              </strong>
              <small>
                {!voiceChannelConnected
                  ? '仍可使用文字输入，连接语音后恢复上次模式'
                  : preferences.voiceInputMode === 'continuous'
                    ? '点击开始后即可持续自然对话'
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
                      <span>已检索 {message.sourcePreview.sources.length} 个网页来源</span>
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
            <span>新消息</span>
            <CaretDownIcon size={12} weight="bold" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {textComposerOpen ? (
        <form
          id="text-composer"
          className="text-composer no-drag"
          aria-label="文字输入"
          onSubmit={(event) => {
            event.preventDefault();
            void submitTextMessage();
          }}
        >
          <div className="text-composer-row">
            <textarea
              ref={textInputRef}
              aria-label="输入文字消息"
              aria-describedby={textInputError ? 'text-input-error' : undefined}
              disabled={textInputBlocked}
              maxLength={maximumTextMessageLength}
              placeholder={textInputBlocked ? '连接导游后即可输入文字' : '输入文字，Enter 发送'}
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
              aria-label={isSendingText ? '正在发送文字消息' : '发送文字消息'}
              disabled={textInputBlocked || isSendingText || !textDraft.trim()}
              title="发送"
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
          title={textComposerOpen ? '收起文字输入' : '展开文字输入'}
        >
          <KeyboardIcon
            size={16}
            weight={textComposerOpen ? 'fill' : 'regular'}
            aria-hidden="true"
          />
          <span>文字</span>
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
            <div className="voice-mode-menu" role="menu" aria-label="选择语音模式">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={preferences.voiceInputMode === 'push_to_talk'}
                onClick={() => void selectVoiceInputMode('push_to_talk')}
              >
                <MicrophoneIcon size={16} aria-hidden="true" />
                <span>按住说话</span>
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
                <span>连续对话</span>
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
                    ? '结束连续对话'
                    : '开始连续对话'
                  : microphone.enabled
                    ? '正在聆听，松开结束'
                    : '按住说话，或按住空格键说话'
              }
              aria-pressed={microphone.enabled}
              disabled={interactionBlocked || voiceTransitioning}
              title={
                errorMessage ||
                (!voiceChannelConnected
                  ? '请先连接语音'
                  : preferences.voiceInputMode === 'push_to_talk'
                    ? '也可以按住空格键说话'
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
                    ? '等待导游'
                    : '正在切换'
                  : voiceButtonState === 'error'
                    ? '麦克风不可用'
                    : preferences.voiceInputMode === 'continuous'
                      ? continuousActive
                        ? '结束连续对话'
                        : '连续对话'
                      : microphone.enabled
                        ? '松开结束'
                        : '按住说话'}
              </span>
            </button>
            <button
              type="button"
              className="voice-mode-menu-toggle"
              aria-label="切换语音模式"
              aria-haspopup="menu"
              aria-expanded={voiceModeMenuOpen}
              disabled={voiceTransitioning}
              onClick={() => setVoiceModeMenuOpen((open) => !open)}
              title="切换语音模式"
            >
              <CaretDownIcon size={13} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`voice-channel-button ${voiceChannelActive ? 'is-connected' : 'is-disconnected'}`}
          aria-label={voiceChannelActive ? '挂断语音连接' : '连接语音'}
          aria-pressed={voiceChannelActive}
          disabled={voiceTransitioning || starting}
          onClick={() => void (voiceChannelActive ? hangUpVoiceChannel() : connectVoiceChannel())}
          title={voiceChannelActive ? '挂断语音连接' : '连接语音'}
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

const Source = () => {
  const [state, setState] = useState<SourceWindowState | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previewScrollTopRef = useRef(0);

  useEffect(() => {
    void window.desktop?.getSourceState().then((nextState) => {
      if (nextState) setState(nextState);
    });
    return window.desktop?.onSourceState(setState);
  }, []);

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

  return (
    <main className="source-shell">
      <header className="source-bar drag-bar">
        {state && state.mode !== 'preview' ? (
          <button
            type="button"
            className="source-icon-button no-drag"
            aria-label="返回搜索来源"
            title="返回搜索来源"
            onClick={() => void window.desktop?.backToSources()}
          >
            <ArrowLeftIcon size={17} aria-hidden="true" />
          </button>
        ) : (
          <MagnifyingGlassIcon size={17} color="#476eae" aria-hidden="true" />
        )}
        <span className="source-heading">
          <b>{state?.mode === 'preview' ? '搜索来源' : (hostname ?? '来源网页')}</b>
          <small>
            {state?.mode === 'preview'
              ? `${state.preview.sources.length} 个可查看来源`
              : state?.mode === 'loading'
                ? '正在加载原始页面'
                : state?.mode === 'error'
                  ? '页面加载失败'
                  : '原始页面'}
          </small>
        </span>
        {state && state.mode !== 'preview' ? (
          <>
            <div className="source-layout-toggle no-drag" role="group" aria-label="网页预览布局">
              <button
                type="button"
                aria-label="电脑布局"
                aria-pressed={state.layoutMode === 'desktop'}
                title="电脑布局"
                onClick={() => void window.desktop?.setSourceLayoutMode('desktop')}
              >
                <DesktopIcon
                  size={17}
                  weight={state.layoutMode === 'desktop' ? 'fill' : 'regular'}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                aria-label="竖版布局"
                aria-pressed={state.layoutMode === 'portrait'}
                title="竖版布局"
                onClick={() => void window.desktop?.setSourceLayoutMode('portrait')}
              >
                <DeviceTabletIcon
                  size={17}
                  weight={state.layoutMode === 'portrait' ? 'fill' : 'regular'}
                  aria-hidden="true"
                />
              </button>
            </div>
            <button
              type="button"
              className="source-icon-button no-drag"
              aria-label="在系统浏览器打开"
              title="在系统浏览器打开"
              onClick={() => void window.desktop?.openCurrentSourceExternal()}
            >
              <ArrowSquareOutIcon size={16} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <button
          className="source-icon-button no-drag"
          aria-label="关闭来源窗口"
          title="关闭"
          onClick={() => void window.desktop?.closeSource()}
        >
          <XIcon size={16} aria-hidden="true" />
        </button>
      </header>
      {!state ? (
        <div className="source-status" role="status">
          <CircleNotchIcon className="source-spinner" size={22} aria-hidden="true" />
          <span>正在准备来源预览…</span>
        </div>
      ) : state.mode === 'preview' ? (
        <div
          ref={listRef}
          className="source-results"
          onScroll={rememberListPosition}
          aria-label="搜索来源列表"
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
                  <span>源</span>
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
          <strong>无法打开这个网页</strong>
          <span>{state.source.title}</span>
          <p>{state.message}</p>
          <small>{state.currentUrl}</small>
          <div>
            <button type="button" onClick={() => void window.desktop?.retrySource()}>
              重试
            </button>
            <button type="button" onClick={() => void window.desktop?.openCurrentSourceExternal()}>
              系统浏览器打开
            </button>
            <button type="button" onClick={() => void window.desktop?.backToSources()}>
              返回来源列表
            </button>
          </div>
        </div>
      ) : state.mode === 'loading' ? (
        <div className="source-status" role="status">
          <CircleNotchIcon className="source-spinner" size={24} aria-hidden="true" />
          <strong>正在加载网页</strong>
          <span>{state.source.title}</span>
          <span>{hostname}</span>
        </div>
      ) : (
        <div className="source-remote-placeholder" aria-label="原始网页已加载" />
      )}
    </main>
  );
};

const SettingsRoute = () => {
  const { preferences, updatePreference } = usePreferences();
  return (
    <div className="utility-root">
      <SettingsDialog
        preferences={preferences}
        updatePreference={updatePreference}
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
