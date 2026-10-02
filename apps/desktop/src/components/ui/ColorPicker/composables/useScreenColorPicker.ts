import { inject, onBeforeUnmount, ref } from 'vue';
import { holdPopoverInteractionKey } from '../../popover/popover-interaction-types';
import type { ScreenColorWindow } from '../screen-color-types';

export function useScreenColorPicker(onColor: (color: string) => void) {
  const api = window.capture;
  const nativePortal = api?.platform === 'linux';
  const pickerWindow = window as ScreenColorWindow;
  const available = nativePortal || typeof pickerWindow.EyeDropper === 'function';
  const pending = ref(false);
  const error = ref<string | null>(null);
  const holdInteraction = inject(holdPopoverInteractionKey, null);
  let controller: AbortController | null = null;
  let releaseInteraction: (() => void) | undefined;
  let disposed = false;

  async function open() {
    if (!available || pending.value || disposed) return;
    pending.value = true;
    error.value = null;
    controller = new AbortController();
    releaseInteraction = holdInteraction?.();
    try {
      let color: string | null;
      if (nativePortal) {
        color = await api.pickScreenColor();
      } else {
        const EyeDropper = pickerWindow.EyeDropper;
        if (!EyeDropper) throw new Error('Screen color picker is unavailable.');
        color = (await new EyeDropper().open({ signal: controller.signal })).sRGBHex;
      }
      if (disposed || color === null) return;
      if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Screen color picker returned an invalid color.');
      onColor(color);
    } catch (failure) {
      if (!disposed && !(failure instanceof DOMException && failure.name === 'AbortError')) {
        error.value = failure instanceof Error ? failure.message : String(failure);
      }
    } finally {
      pending.value = false;
      controller = null;
      releaseInteraction?.();
      releaseInteraction = undefined;
    }
  }

  onBeforeUnmount(() => {
    disposed = true;
    controller?.abort();
    if (nativePortal && pending.value) {
      void api
        .cancelScreenColorPicker()
        .catch((failure: unknown) => console.error('Color picker cancellation failed', failure));
    }
    releaseInteraction?.();
    releaseInteraction = undefined;
  });

  return { available, pending, error, open };
}
