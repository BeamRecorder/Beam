import { nextTick, ref } from 'vue';
import type { HudCaptureActionsOptions, HudCaptureTarget, PreviewKind } from './hud-state-types';

export function useHudCaptureActions(options: HudCaptureActionsOptions) {
  const captureTarget = ref<HudCaptureTarget>('screen');
  const sourcePicker = ref<PreviewKind | null>(null);
  const choosingSource = ref(false);
  const chooseCapture = async (target: HudCaptureTarget) => {
    if (options.blocked.value || choosingSource.value) return;
    choosingSource.value = true;
    captureTarget.value = target;
    options.activeTab.value = target === 'window' ? 'window' : 'screen';
    await nextTick();
    if (target !== 'region') options.resetRegion();
    try {
      if (target === 'region') {
        if (await options.selectRegion()) await options.start();
      } else if (options.platform === 'linux') {
        await options.start();
      } else {
        sourcePicker.value = target;
        await options.refreshSources(target);
      }
    } finally {
      choosingSource.value = false;
    }
  };
  const selectCaptureSource = async (id: string) => {
    const kind = sourcePicker.value;
    if (!kind || options.blocked.value || choosingSource.value) return;
    if (kind === 'screen') {
      if (!options.sources.value.some((source) => source.kind === 'display' && source.id === id)) return;
      options.selectedScreenId.value = id;
    } else {
      if (
        !options.windowPreviews.value.some((preview) => preview.id === id) &&
        !options.sources.value.some((source) => source.kind === 'window' && source.id === id)
      )
        return;
      options.selectedSourceId.value = id;
    }
    choosingSource.value = true;
    try {
      await nextTick();
      await options.start();
      sourcePicker.value = null;
    } finally {
      choosingSource.value = false;
    }
  };
  return { captureTarget, sourcePicker, choosingSource, chooseCapture, selectCaptureSource };
}
