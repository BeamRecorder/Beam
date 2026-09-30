import { nextTick, ref } from 'vue';
import type { HudCaptureActionsOptions, HudCaptureTarget } from './hud-state-types';

export function useHudCaptureActions(options: HudCaptureActionsOptions) {
  const captureTarget = ref<HudCaptureTarget>('screen');
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
      } else if (options.platform === 'linux' && !options.developmentSources) {
        await options.start();
      } else {
        const selection = await options.selectSource(target);
        if (!selection) return;
        if (selection.development) {
          await options.previewSelection();
          return;
        }
        options.activeTab.value = selection.kind;
        captureTarget.value = selection.kind;
        if (selection.kind === 'screen') options.selectedScreenId.value = selection.id;
        else options.selectedSourceId.value = selection.id;
        await nextTick();
        await options.start();
      }
    } finally {
      choosingSource.value = false;
    }
  };
  return { captureTarget, choosingSource, chooseCapture };
}
