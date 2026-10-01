import type { RecordingBarVisibility } from '../recorder/recording-types';
import type { InteractionAccessViewState } from '../interactions/interaction-access-types';

export type SettingsView = 'general' | 'recording' | 'accessibility' | 'shortcuts' | 'updates' | 'about' | 'developer';

export interface HudPreferenceProps {
  countdownSeconds: number;
  showRealCursor?: boolean;
  hideTaskbar?: boolean;
  hideDesktopIcons?: boolean;
  alwaysOnTop?: boolean;
  recordingBarVisibility?: RecordingBarVisibility;
  inputAccess?: InteractionAccessViewState;
  recordInteractions?: boolean;
  requestingInputAccess?: boolean;
  platform?: string;
  view?: SettingsView;
  focusedSetting?: string;
}

export interface SettingsSearchEntry {
  id: string;
  view: SettingsView;
  title: string;
  description: string;
  terms: readonly string[];
}

export interface SettingsSearchIndex {
  search: (query: string) => SettingsSearchEntry[];
}
