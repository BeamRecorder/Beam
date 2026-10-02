import { capture } from '~/api/capture';

// Synthetic source IDs are never submitted to native capture. Reuse the real
// countdown surface to inspect the selection handoff with development data.
export async function previewSelectionCountdown(duration = 3): Promise<void> {
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
