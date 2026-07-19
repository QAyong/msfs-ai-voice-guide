import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
import { PowerIcon } from '@phosphor-icons/react/dist/csr/Power';
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/csr/SpeakerHigh';
import { SparkleIcon } from '@phosphor-icons/react/dist/csr/Sparkle';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import type { DesktopReadiness } from '../../../shared/desktop-contracts.js';
import {
  guideSourcesTopic,
  parseGuideSourcesMessage,
  type GuideSource,
} from '../../../shared/guide-events.js';
import {
  guideVoiceAttributes,
  guideVoiceRpc,
  isGuideUserState,
  isVoiceInputMode,
  type GuideVoiceRpcMethod,
  type VoiceInputMode,
} from '../../../shared/voice-control.js';
import { resolveVoiceStatus } from './voice-ui-state.js';
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
  preferences: Preferences;
  readiness: DesktopReadiness | null;
  retry(): Promise<void>;
  session: UseSessionReturn;
  starting: boolean;
  startupError: string;
  updatePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void;
};

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  sources: GuideSource[];
  text: string;
};

const Assistant = () => {
  const { preferences, updatePreference } = usePreferences();
  const [readiness, setReadiness] = useState<DesktopReadiness | null>(null);
  const [starting, setStarting] = useState(true);
  const [startupError, setStartupError] = useState('');
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
      <RoomAudioRenderer volume={preferences.agentVolume} />
      <AssistantView
        preferences={preferences}
        readiness={readiness}
        retry={startSession}
        session={session}
        starting={starting}
        startupError={startupError}
        updatePreference={updatePreference}
      />
    </SessionProvider>
  );
};

const AssistantView = ({
  preferences,
  readiness,
  retry,
  session,
  starting,
  startupError,
  updatePreference,
}: AssistantViewProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDirection, setMenuDirection] = useState<MenuDirection>('down');
  const [browserDialog, setBrowserDialog] = useState<UtilityDialog | null>(null);
  const [voiceTransitioning, setVoiceTransitioning] = useState(false);
  const [controlError, setControlError] = useState('');
  const [microphoneError, setMicrophoneError] = useState('');
  const [sourcesByMessage, setSourcesByMessage] = useState<Record<string, GuideSource[]>>({});
  const menuCloseTimer = useRef<number | null>(null);
  const pushToTalkPressedRef = useRef(false);
  const pushToTalkTurnActiveRef = useRef(false);
  const pushToTalkStartRef = useRef<Promise<void> | null>(null);
  const pushToTalkFinishRef = useRef<Promise<void> | null>(null);
  const continuousTransitionRef = useRef(false);
  const latestAgentMessageIdRef = useRef<string | null>(null);
  const pendingSourcesRef = useRef<GuideSource[] | null>(null);
  const agentStateRef = useRef<string>('disconnected');
  const agent = useAgent();
  const { messages } = useSessionMessages();
  const { perform } = useRpc();
  agentStateRef.current = agent.state;

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

  const displayMessages = useMemo<DisplayMessage[]>(() => {
    return messages
      .filter((message) => message.type === 'userTranscript' || message.type === 'agentTranscript')
      .map<DisplayMessage>((message) => ({
        id: message.id,
        role: message.type === 'userTranscript' ? 'user' : 'assistant',
        sources: sourcesByMessage[message.id] ?? [],
        text: message.message,
      }))
      .filter((message) => message.text.trim().length > 0)
      .slice(-8);
  }, [messages, sourcesByMessage]);

  const latestAgentMessageId =
    [...displayMessages].reverse().find((message) => message.role === 'assistant')?.id ?? null;
  latestAgentMessageIdRef.current = latestAgentMessageId;

  useEffect(() => {
    if (!latestAgentMessageId || !pendingSourcesRef.current) return;
    const nextSources = pendingSourcesRef.current;
    pendingSourcesRef.current = null;
    setSourcesByMessage((current) => ({ ...current, [latestAgentMessageId]: nextSources }));
  }, [latestAgentMessageId]);

  const onSourcesMessage = useCallback((message: { payload: Uint8Array }) => {
    const parsed = parseGuideSourcesMessage(new TextDecoder().decode(message.payload));
    if (!parsed) return;
    const currentMessageId = latestAgentMessageIdRef.current;
    if (currentMessageId && agentStateRef.current === 'speaking') {
      setSourcesByMessage((current) => ({ ...current, [currentMessageId]: parsed.sources }));
    } else {
      pendingSourcesRef.current = parsed.sources;
    }
  }, []);
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
  const interactionBlocked = setupBlocked || !agent.canListen;
  const voiceButtonState = microphoneError
    ? 'error'
    : voiceTransitioning || microphone.pending || starting || agent.isPending
      ? 'requesting'
      : microphone.enabled
        ? 'listening'
        : 'idle';

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
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      const targetButton =
        event.target instanceof HTMLElement ? event.target.closest('button') : null;
      if (targetButton && !targetButton.classList.contains('voice-button')) return;
      event.preventDefault();
      beginPushToTalk();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !pushToTalkPressedRef.current) return;
      event.preventDefault();
      void finishPushToTalk();
    };
    const onBlur = () => {
      if (pushToTalkPressedRef.current) void finishPushToTalk(true);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [beginPushToTalk, finishPushToTalk, preferences.voiceInputMode]);

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
          className={`status status--${session.connectionState}`}
          title={errorMessage || undefined}
        >
          {statusLabel}
        </span>
        <button className="text-button no-drag" onClick={() => void changeCollapsed(true)}>
          收起
        </button>
      </header>
      <section className="messages" aria-label="最近对话">
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
            <strong>{session.isConnected ? '可以开始对话了' : '正在准备语音导游'}</strong>
            <small>
              {preferences.voiceInputMode === 'continuous'
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
                <p className="bubble">{message.text}</p>
                {message.sources.map((source) => (
                  <button
                    key={source.url}
                    className="source-card no-drag"
                    onClick={() => void openSource(source.url)}
                  >
                    <span className="source-mark">源</span>
                    <span>
                      <b>{source.title}</b>
                      <small>{source.siteName} · 原始网页</small>
                    </span>
                  </button>
                ))}
              </div>
            ),
          )
        )}
      </section>
      <footer className="voice-area">
        <div className="voice-mode-switch" role="group" aria-label="语音输入模式">
          <button
            type="button"
            className="no-drag"
            disabled={voiceTransitioning}
            aria-pressed={preferences.voiceInputMode === 'push_to_talk'}
            onClick={() => void changeVoiceInputMode('push_to_talk')}
          >
            按住说话
          </button>
          <button
            type="button"
            className="no-drag"
            disabled={voiceTransitioning}
            aria-pressed={preferences.voiceInputMode === 'continuous'}
            onClick={() => void changeVoiceInputMode('continuous')}
          >
            连续对话
          </button>
        </div>
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
            (preferences.voiceInputMode === 'push_to_talk' ? '也可以按住空格键说话' : undefined)
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
            size={18}
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
                : setupBlocked
                  ? '重新连接'
                  : preferences.voiceInputMode === 'continuous'
                    ? continuousActive
                      ? '结束连续对话'
                      : '开始连续对话'
                    : microphone.enabled
                      ? '松开结束'
                      : '按住说话'}
          </span>
        </button>
      </footer>
    </main>
  );
};

const Source = () => (
  <main className="source-shell">
    <header className="source-bar drag-bar">
      <span className="source-title">来源网页</span>
      <span className="source-domain">仅加载 HTTPS 原始页面</span>
      <button className="text-button no-drag" onClick={() => void window.desktop?.closeSource()}>
        关闭
      </button>
    </header>
    <div className="source-placeholder">正在安全加载来源网页…</div>
  </main>
);

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
