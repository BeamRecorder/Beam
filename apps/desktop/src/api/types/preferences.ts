import type { AppearanceSettings } from '~/types/appearance';
import type { GradientBackground } from '@beam/engine/shared/background-types';
import type { RecordingBarVisibility } from '../../components/hud/recorder/recording-types';
import type { DirectorySettings } from './storage-directories';

export interface PreferenceShortcut {
  keys: string;
  scope: 'global' | 'application';
  category: string;
}
export interface PreferenceSettings {
  alwaysOnTop?: boolean;
  launchAtStartup?: boolean;
  schemaVersion: 3;
  theme: 'light' | 'dark' | 'system';
  appearance?: AppearanceSettings;
  hudWindow?: { width: number; height: number };
  recordingBar: { visibility: RecordingBarVisibility };
  recordingInteractions: { enabled: boolean; noticeDismissed: boolean };
  voiceover?: { countdownSeconds: 0 | 3 | 5 | 10; monitorProjectAudio: boolean };
  spellCheck?: { enabled: boolean };
  directories?: DirectorySettings;
  onboardingCompleted?: boolean;
  devices: {
    cameraId?: string;
    micId?: string;
    systemAudioMode?: string;
    [key: string]: unknown;
  };
  shortcuts: Record<string, PreferenceShortcut>;
  backgroundPresets: { colors: string[]; gradients: GradientBackground[] };
  extras: Record<string, unknown>;
}

export type PreferencePatch = Partial<
  Omit<PreferenceSettings, 'recordingInteractions' | 'spellCheck' | 'appearance' | 'voiceover' | 'directories'>
> & {
  recordingInteractions?: Partial<PreferenceSettings['recordingInteractions']>;
  spellCheck?: Partial<PreferenceSettings['spellCheck']>;
  appearance?: Partial<AppearanceSettings>;
  voiceover?: Partial<NonNullable<PreferenceSettings['voiceover']>>;
};
