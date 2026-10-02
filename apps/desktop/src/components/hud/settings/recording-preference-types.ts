import type { RecordingBarVisibility } from '../recorder/recording-types';
export interface RecordingPreferenceProps {
  countdownSeconds: number;
  showRealCursor?: boolean;
  hideTaskbar?: boolean;
  hideDesktopIcons?: boolean;
  recordingBarVisibility?: RecordingBarVisibility;
  alwaysOnTop?: boolean;
}
