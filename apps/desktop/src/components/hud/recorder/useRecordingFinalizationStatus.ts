import { onScopeDispose, ref, watch } from 'vue';
import type { RecordingPhase } from './recording-types';

export function useRecordingFinalizationStatus(phase: () => RecordingPhase, platform: () => string | undefined) {
  const takingLonger = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  watch(
    phase,
    (value) => {
      clear();
      takingLonger.value = false;
      if (value === 'finalizing' && platform() === 'win32') {
        timer = setTimeout(() => {
          takingLonger.value = true;
        }, 15_000);
      }
    },
    { immediate: true },
  );
  onScopeDispose(clear);
  return { takingLonger };
}
