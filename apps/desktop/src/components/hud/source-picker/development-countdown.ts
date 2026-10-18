import { capture } from '~/api/capture';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { PrepareRecording } from '../recorder/capture-preparation-types';

// Synthetic source IDs are never submitted to native capture. Reuse the real
// countdown surface to inspect the selection handoff with development data.
export async function previewSelectionCountdown(
  duration = 3,
  prepare?: PrepareRecording,
  settings: RegionRecordingSettings = {
    cameraId: 'off',
    microphoneId: 'no-audio',
    systemAudio: false,
    countdownSeconds: duration,
    hideTaskbar: false,
    hideDesktopIcons: false,
    showRealCursor: false,
  },
): Promise<void> {
  if (prepare)
    return prepare({ settings }, async (next) => {
      try {
        await previewSelectionCountdown(next.countdownSeconds);
      } finally {
        capture.showHud();
      }
    });
  if (duration <= 0) return;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const unsubscribe = capture.onCountdownCancelled(() => {
    cancelled = true;
    clearTimeout(timer);
    wake?.();
  });
  try {
    for (let seconds = duration; seconds > 0 && !cancelled; seconds--) {
      await capture.setCountdown(seconds);
      if (cancelled) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
        timer = setTimeout(resolve, 1000);
      });
    }
  } finally {
    clearTimeout(timer);
    unsubscribe();
    await capture.setCountdown(null);
  }
}
