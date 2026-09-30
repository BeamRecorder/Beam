import { capture } from '~/api/capture';

// Synthetic source IDs are never submitted to native capture. Reuse the real
// countdown surface to inspect the selection handoff with development data.
export async function previewSelectionCountdown(): Promise<void> {
  try {
    for (let seconds = 3; seconds > 0; seconds--) {
      await capture.setCountdown(seconds);
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    await capture.setCountdown(null);
  }
}
