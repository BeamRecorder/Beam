import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { capture } from '~/api/capture';
import { preparationPreferences } from './preparation-settings';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { CapturePreparationRequest, PrepareRecording } from './capture-preparation-types';

/** Owns setup and confirmation; native recording and its countdown start only after handoff. */
export function useCapturePreparation() {
  const active = ref(false);
  const waiting = ref(false);
  const request = ref<CapturePreparationRequest | null>(null);
  const countdownSeconds = computed(() => request.value?.settings.countdownSeconds ?? 3);
  const update = (settings: RegionRecordingSettings) => {
    if (waiting.value && request.value) request.value = { ...request.value, settings: { ...settings } };
  };
  const offSettings = capture.preparation.onChanged(update);
  const handingOff = ref(false);
  const blocking = computed(() => active.value && !handingOff.value);
  let decide: ((confirmed: boolean) => void) | undefined;
  let disposed = false;
  let restoreOnCancel = true;
  let releaseSource: Promise<void> | undefined;
  const release = () => (releaseSource ??= capture.cancelRegionSelection());
  const answer = (confirmed: boolean) => {
    if (!waiting.value) return;
    waiting.value = false;
    decide?.(confirmed);
  };
  const unsubscribe = capture.onWindowVisibility((visible) => {
    if (!visible && waiting.value) {
      restoreOnCancel = false;
      answer(false);
    }
  });
  const run: PrepareRecording = async (next, start) => {
    if (disposed || active.value) return;
    active.value = true;
    waiting.value = true;
    request.value = { ...next, settings: { ...next.settings } };
    handingOff.value = false;
    restoreOnCancel = true;
    releaseSource = undefined;
    try {
      const decision = new Promise<boolean>((resolve) => {
        decide = resolve;
      });
      capture.setWindowMode('preparation');
      await capture.preparation.configure({ ...next.settings });
      const confirmed = await decision;
      if (disposed) return;
      if (!confirmed) {
        capture.configureCameraOverlay({ cameraId: next.settings.cameraId });
        await release();
        if (!disposed && restoreOnCancel) capture.showHud();
        return;
      }
      capture.preparation.close();
      const settings = { ...request.value!.settings };
      await capture.updatePreferences(preparationPreferences(settings));
      if (disposed) {
        await release();
        return;
      }
      handingOff.value = true;
      // Release the normal-recording guard before Instant's owned IPC starts.
      await nextTick();
      if (!disposed) await start(settings);
    } catch (reason) {
      if (!handingOff.value) capture.configureCameraOverlay({ cameraId: next.settings.cameraId });
      if (!handingOff.value)
        await release().catch((cleanup) => console.error('Failed to release the prepared capture source:', cleanup));
      if (!disposed && restoreOnCancel) capture.showHud();
      throw reason;
    } finally {
      capture.preparation.close();
      decide = undefined;
      waiting.value = false;
      active.value = false;
      handingOff.value = false;
    }
  };
  onBeforeUnmount(() => {
    disposed = true;
    unsubscribe();
    offSettings();
    capture.preparation.close();
    if (active.value && !handingOff.value)
      void release().catch((reason) => console.error('Failed to release the prepared capture source:', reason));
    answer(false);
  });
  return {
    active,
    waiting,
    blocking,
    countdownSeconds,
    request,
    update,
    run,
    confirm: () => answer(true),
    cancel: () => answer(false),
  };
}
