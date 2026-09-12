import { onScopeDispose, ref, watch } from 'vue';
import type { OutputCanvasSettings } from '../output-canvas';

export function useCanvasFormatTransition(output: () => OutputCanvasSettings, render: () => void) {
  const transitioning = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  watch(
    () => `${output().width}:${output().height}:${output().showBackground}`,
    () => {
      transitioning.value = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        transitioning.value = false;
      }, 260);
      render();
    },
  );
  onScopeDispose(() => {
    if (timer) clearTimeout(timer);
  });
  return transitioning;
}
