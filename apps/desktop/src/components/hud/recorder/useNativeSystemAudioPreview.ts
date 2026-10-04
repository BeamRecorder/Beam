import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { capture } from '../../../api/capture';

const POLL_INTERVAL_MS = 200;

export function useNativeSystemAudioPreview(enabled: Ref<boolean>) {
  const level = ref(0);
  let active = false;
  let generation = 0;
  let polling = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let transition: Promise<void> = Promise.resolve();

  const clearPolling = () => {
    if (timer) clearInterval(timer);
    timer = null;
    polling = false;
    level.value = 0;
  };

  const poll = async (expectedGeneration: number) => {
    if (!active || polling || expectedGeneration !== generation) return;
    polling = true;
    try {
      const nextLevel = await capture.systemAudioPreviewLevel();
      if (active && expectedGeneration === generation) {
        level.value = Math.max(0, Math.min(1, nextLevel));
      }
    } catch {
      if (expectedGeneration === generation) level.value = 0;
    } finally {
      polling = false;
    }
  };

  const activate = (expectedGeneration: number) => {
    transition = transition
      .catch(() => undefined)
      .then(async () => {
        if (expectedGeneration !== generation || !enabled.value) return;
        await capture.startSystemAudioPreview();
        active = true;
        if (expectedGeneration !== generation || !enabled.value) {
          active = false;
          await capture.stopSystemAudioPreview();
          return;
        }
        timer = setInterval(() => void poll(expectedGeneration), POLL_INTERVAL_MS);
      })
      .catch(() => {
        active = false;
        level.value = 0;
      });
  };

  const deactivate = () => {
    clearPolling();
    if (active) {
      active = false;
      const stopping = capture.stopSystemAudioPreview();
      transition = stopping.catch(() => undefined);
    }
  };

  watch(
    enabled,
    (shouldEnable) => {
      generation += 1;
      clearPolling();
      if (capture.platform === 'linux' && shouldEnable) activate(generation);
      else deactivate();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    generation += 1;
    deactivate();
  });

  return { level };
}
