import type { Ref } from 'vue';
import { capture } from '~/api/capture';

export function createRecordingCountdown(remaining: Ref<number>) {
  let timer: number | null = null;
  let unsubscribe: (() => void) | null = null;
  const clear = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    unsubscribe?.();
    unsubscribe = null;
  };
  const start = (elapsed: () => void, cancel: () => void) => {
    clear();
    if (remaining.value <= 0) {
      elapsed();
      return;
    }
    unsubscribe = capture.onCountdownCancelled(() => {
      if (timer === null) return;
      clear();
      cancel();
    });
    void capture.setCountdown(remaining.value);
    timer = window.setInterval(() => {
      remaining.value = Math.max(0, remaining.value - 1);
      if (remaining.value > 0) void capture.setCountdown(remaining.value);
      else {
        clear();
        void capture.setCountdown(null);
        elapsed();
      }
    }, 1000);
  };
  return { start, clear };
}
