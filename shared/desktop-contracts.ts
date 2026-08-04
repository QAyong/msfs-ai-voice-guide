import type { SourceReadingPreferences } from './source-reading-preferences.js';

export type DesktopReadinessStatus =
  'checking' | 'setup_required' | 'worker_starting' | 'ready' | 'error';

export type DesktopReadiness = {
  status: DesktopReadinessStatus;
  message: string;
  issues: string[];
};

export type DesktopSessionCredentials = {
  serverUrl: string;
  token: string;
  roomName: string;
  participantIdentity: string;
};

export type DesktopSessionResult =
  { ok: true; credentials: DesktopSessionCredentials } | { ok: false; readiness: DesktopReadiness };

export type WindowRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StoredWindowState = {
  assistant?: WindowRectangle;
  expandedAssistant?: WindowRectangle;
  source?: { width: number; height: number };
  collapsed?: boolean;
  dockSide?: 'left' | 'right';
  sourceReadingPreferences?: SourceReadingPreferences;
};
