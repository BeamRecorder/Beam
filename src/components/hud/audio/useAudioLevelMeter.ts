import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { capture } from '~/api/capture';

export function useAudioLevelMeter(enabled: Ref<boolean>, _sourceId?: Ref<string | undefined>, system = false) {
  const level = ref(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  let generation = 0;
  const poll = async () => {
    if (!enabled.value || busy) return;
    busy = true;
    const current = generation;
    try {
      const levels = await capture.audioLevels();
      if (current === generation)
        level.value = Math.min(1, Math.max(0, (system ? levels.systemAudio : levels.microphone)?.peak ?? 0));
    } catch {
      if (current === generation) level.value = 0;
    } finally {
      busy = false;
    }
  };
  const stop = () => {
    generation += 1;
    if (timer) clearInterval(timer);
    timer = null;
    level.value = 0;
  };
  watch(
    enabled,
    (active) => {
      stop();
      if (active) {
        timer = setInterval(() => void poll(), 200);
        void poll();
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(stop);
  return { level };
}
