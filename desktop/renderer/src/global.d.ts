export {};

import type { DesktopReadiness, DesktopSessionResult } from '../../../shared/desktop-contracts.js';
import type { GuideSourcesMessage } from '../../../shared/guide-events.js';
import type { SourceLayoutMode, SourceWindowState } from '../../../shared/source-preview.js';

declare global {
  interface Window {
    desktop?: {
      setCollapsed(collapsed: boolean): Promise<void>;
      getAssistantState(): Promise<{ collapsed: boolean }>;
      setBallMenuOpen(open: boolean): Promise<'up' | 'down'>;
      openSettings(): Promise<void>;
      openQuitDialog(): Promise<void>;
      closeUtilityWindow(): Promise<void>;
      quitApp(): Promise<void>;
      setAlwaysOnTop(enabled: boolean): Promise<void>;
      openSource(url: string): Promise<boolean>;
      openSourcePreview(preview: GuideSourcesMessage): Promise<boolean>;
      getSourceState(): Promise<SourceWindowState | null>;
      onSourceState(callback: (state: SourceWindowState) => void): () => void;
      selectSource(url: string): Promise<boolean>;
      backToSources(): Promise<boolean>;
      retrySource(): Promise<boolean>;
      setSourceLayoutMode(mode: SourceLayoutMode): Promise<boolean>;
      openCurrentSourceExternal(): Promise<boolean>;
      closeSource(): Promise<void>;
      openExternal(url: string): Promise<void>;
      getReadiness(): Promise<DesktopReadiness>;
      retryReadiness(): Promise<DesktopReadiness>;
      openConfiguration(): Promise<boolean>;
      createLiveKitSession(): Promise<DesktopSessionResult>;
    };
  }
}
