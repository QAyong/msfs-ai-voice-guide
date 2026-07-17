import { StrictMode, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserIcon } from '@phosphor-icons/react/dist/csr/Browser';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { MicrophoneIcon } from '@phosphor-icons/react/dist/csr/Microphone';
import { PowerIcon } from '@phosphor-icons/react/dist/csr/Power';
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin';
import { SparkleIcon } from '@phosphor-icons/react/dist/csr/Sparkle';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { useMicrophoneTrack } from './useMicrophoneTrack.js';
import './style.css';

const lakeUrl = 'https://zh.wikipedia.org/wiki/%E8%8B%8F%E9%BB%8E%E4%B8%96%E6%B9%96';
const preferenceStorageKey = 'cloudpath-guide-preferences';

type MenuDirection = 'up' | 'down';
type UtilityDialog = 'settings' | 'quit';

type Preferences = {
  alwaysOnTop: boolean;
  openSourcesInApp: boolean;
  interfaceMotion: boolean;
};

const defaultPreferences: Preferences = {
  alwaysOnTop: true,
  openSourcesInApp: true,
  interfaceMotion: true,
};

const readPreferences = (): Preferences => {
  try {
    const saved = localStorage.getItem(preferenceStorageKey);
    return saved ? { ...defaultPreferences, ...JSON.parse(saved) } : defaultPreferences;
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

const Assistant = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDirection, setMenuDirection] = useState<MenuDirection>('down');
  const [browserDialog, setBrowserDialog] = useState<UtilityDialog | null>(null);
  const menuCloseTimer = useRef<number | null>(null);
  const { preferences, updatePreference } = usePreferences();
  const microphone = useMicrophoneTrack();
  const listening = microphone.state === 'listening';

  useEffect(
    () => () => {
      if (menuCloseTimer.current !== null) window.clearTimeout(menuCloseTimer.current);
    },
    [],
  );

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

  const openSource = async () => {
    if (!window.desktop) {
      window.open(lakeUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (preferences.openSourcesInApp) await window.desktop.openSource(lakeUrl);
    else await window.desktop.openExternal(lakeUrl);
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
        <span className="status">{listening ? '聆听中' : '在线'}</span>
        <button className="text-button no-drag" onClick={() => void changeCollapsed(true)}>
          收起
        </button>
      </header>
      <section className="messages" aria-label="最近对话">
        <p className="bubble user">窗外那片湖泊是什么？</p>
        <div className="guide-reply">
          <p className="bubble">
            你正在飞越苏黎世湖。它从苏黎世城区向东南延伸，天气晴朗时能看见湖岸与远处山脉的轮廓。
          </p>
          <button className="source-card no-drag" onClick={() => void openSource()}>
            <span className="source-mark">W</span>
            <span>
              <b>苏黎世湖 - 维基百科</b>
              <small>zh.wikipedia.org · 原始网页</small>
            </span>
          </button>
        </div>
      </section>
      <footer className="voice-area">
        <button
          className={`voice-button no-drag voice-button--${microphone.state}`}
          type="button"
          aria-label={listening ? '正在聆听，松开结束' : '按住说话'}
          aria-pressed={listening}
          title={microphone.errorMessage || undefined}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            void microphone.start();
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            void microphone.stop();
          }}
          onPointerCancel={() => void microphone.stop()}
          onKeyDown={(event) => {
            if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
              event.preventDefault();
              void microphone.start();
            }
          }}
          onKeyUp={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              void microphone.stop();
            }
          }}
        >
          <MicrophoneIcon
            className="voice-microphone"
            size={18}
            weight={listening ? 'bold' : 'regular'}
            aria-hidden="true"
          />
          <span className="voice-level" aria-hidden="true">
            {[0.72, 1, 0.84, 0.62, 0.46].map((weight, index) => (
              <span
                // The stable index maps to a fixed visualizer bar.
                key={index}
                className="voice-level-bar"
                style={{ transform: `scaleY(${0.16 + microphone.level * weight * 0.84})` }}
              />
            ))}
          </span>
          <span className="voice-label">
            {microphone.state === 'requesting'
              ? '正在连接'
              : microphone.state === 'error'
                ? '麦克风不可用'
                : listening
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
