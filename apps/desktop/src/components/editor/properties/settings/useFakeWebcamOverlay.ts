import { computed, onScopeDispose, ref } from 'vue';
import {
  attachWebcamRecordingOverlay,
  hasRecordingWebcam,
  webcamRecordingTarget,
} from '@beam/engine/composition/webcam-recording-overlay';
import { inspectDroppedMedia } from '@beam/runtime/shared/dropped-media';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import type { FakeWebcamOverlayOptions } from './fake-webcam-types';

export function useFakeWebcamOverlay(options: FakeWebcamOverlayOptions) {
  const { t } = useTranslate('SettingsPanel');
  const busy = ref(false),
    error = ref('');
  let disposed = false;
  let controller: AbortController | null = null;
  onScopeDispose(() => {
    disposed = true;
    controller?.abort();
  });
  const target = computed(() =>
    webcamRecordingTarget(options.composition.value, options.selectedClipId(), options.currentTimeMs()),
  );
  const unavailable = computed(() => {
    if (!options.projectId() || !target.value) return t('fakeWebcamNoRecording');
    if (target.value.locked) return t('fakeWebcamLocked');
    if (hasRecordingWebcam(options.composition.value, target.value)) return t('fakeWebcamExists');
    return '';
  });
  const add = async () => {
    if (busy.value || unavailable.value || disposed) return;
    const projectId = options.projectId()!,
      screenClipId = target.value!.id;
    busy.value = true;
    error.value = '';
    controller = new AbortController();
    try {
      const imported = await capture.importDemoWebcamMedia(projectId);
      if (disposed || options.projectId() !== projectId) return;
      const response = await fetch(imported.src, { signal: controller.signal });
      if (!response.ok) throw new Error(t('fakeWebcamLoadFailed'));
      const file = new File([await response.blob()], 'demo-webcam.mp4', { type: 'video/mp4' });
      const inspection = await inspectDroppedMedia(file, file.name);
      if (disposed || options.projectId() !== projectId) return;
      const asset = {
        ...imported,
        durationMs: inspection.durationMs,
        width: inspection.width,
        height: inspection.height,
      };
      options.composition.value = attachWebcamRecordingOverlay(options.composition.value, {
        screenClipId,
        asset,
        name: t('fakeWebcamTitle'),
        appearance: options.appearance(),
      });
      options.onAdded();
    } catch (cause) {
      console.error('[Beam demo webcam] Could not attach the bundled video.', cause);
      if (!disposed) error.value = t('fakeWebcamLoadFailed');
    } finally {
      busy.value = false;
      controller = null;
    }
  };
  return { busy, error, unavailable, add };
}
