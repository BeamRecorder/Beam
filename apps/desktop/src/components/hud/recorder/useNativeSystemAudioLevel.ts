import { ref, type Ref } from 'vue';
import { capture } from '../../../api/capture';
import type { RecordingPhase } from './recording-types';

export function useNativeSystemAudioLevel(enabled: Ref<boolean>, phase: Ref<RecordingPhase>) {
  const level = ref(0);
  let polling = false;

  const refresh = async () => {
    if (capture.platform !== 'linux' || !enabled.value || phase.value !== 'recording' || polling) return;
    polling = true;
    try {
      const status = await capture.status();
      level.value = Math.max(0, Math.min(1, status.systemAudioLevel ?? 0));
    } catch {
      level.value = 0;
    } finally {
      polling = false;
    }
  };

  const reset = () => {
    level.value = 0;
  };

  return { level, refresh, reset };
}
