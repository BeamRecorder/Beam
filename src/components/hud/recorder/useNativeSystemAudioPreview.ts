import type { Ref } from 'vue';
import { useAudioLevelMeter } from '../audio/useAudioLevelMeter';
export function useNativeSystemAudioPreview(enabled: Ref<boolean>) {
  return useAudioLevelMeter(enabled, undefined, true);
}
