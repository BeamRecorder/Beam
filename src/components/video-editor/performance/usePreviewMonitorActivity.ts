import { computed, onScopeDispose, ref } from 'vue';
import { propertyInteractionActive } from '~/composables/property-interaction';
import { useExportJob } from '~/components/export/useExportJob';
import type { PreviewPerformanceMonitorOptions } from './preview-performance-types';

const INPUT_SETTLE_MS = 1_000;

/** Observe interactive work without keeping a paused editor's compositor awake. */
export function usePreviewMonitorActivity(options: PreviewPerformanceMonitorOptions) {
  const visible = ref(typeof document === 'undefined' || !document.hidden);
  const recentInput = ref(false);
  const { isExporting } = useExportJob();
  const now = options.now ?? (() => performance.now());
  let lastInputAt = 0;
  let inputTimer: ReturnType<typeof setTimeout> | null = null;
  const settleInput = () => {
    const remaining = lastInputAt + INPUT_SETTLE_MS - now();
    if (remaining > 0) inputTimer = setTimeout(settleInput, remaining);
    else {
      inputTimer = null;
      recentInput.value = false;
    }
  };
  const onInput = (event: Event) => {
    if (event.type === 'pointermove' && !(event as PointerEvent).buttons) return;
    lastInputAt = now();
    recentInput.value = true;
    if (inputTimer === null) inputTimer = setTimeout(settleInput, INPUT_SETTLE_MS);
  };
  const onVisibility = () => {
    visible.value = !document.hidden;
    if (!visible.value) {
      if (inputTimer !== null) clearTimeout(inputTimer);
      inputTimer = null;
      recentInput.value = false;
    }
  };
  const events = ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'input', 'wheel'];
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    for (const event of events) document.addEventListener(event, onInput, { capture: true, passive: true });
  }
  onScopeDispose(() => {
    if (inputTimer !== null) clearTimeout(inputTimer);
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onVisibility);
    for (const event of events) document.removeEventListener(event, onInput, true);
  });
  return computed(
    () =>
      visible.value &&
      (options.isReady?.value ?? true) &&
      ((options.isPlaying.value && options.playbackState.value === 'playing') ||
        options.mediaMetrics.value.activeJobs > 0 ||
        options.mediaMetrics.value.pendingJobs > 0 ||
        isExporting.value ||
        propertyInteractionActive.value ||
        recentInput.value),
  );
}
