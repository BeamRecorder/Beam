import { onScopeDispose, ref, shallowRef, watch } from 'vue';
import { removeRecordingPauseGaps } from '@beam/engine/composition/recording-pauses';
import { useToastStore } from '~/ui/toast/toastStore';
import { useTranslate } from '~/i18n/useTranslate';
import type { RecordingPauseCleanupOptions } from './recording-pause-cleanup-types';
import type { EditorStateSnapshot } from '../composables/editor-history-types';

/** Fresh recordings only: one reversible history edit and feedback through the shared toast service. */
export function useRecordingPauseCleanup(options: RecordingPauseCleanupOptions) {
  const toast = useToastStore();
  const { t } = useTranslate('VideoEditor');
  const processed = new Set<string>();
  const visible = ref(document.visibilityState === 'visible');
  const expected = shallowRef<EditorStateSnapshot | null>(null);
  let notificationProject: string | null = null;
  const toastId = ref<string | null>(null);
  const dismiss = () => {
    if (toastId.value) toast.remove(toastId.value);
    toastId.value = null;
    expected.value = null;
    notificationProject = null;
  };
  watch(
    [options.projectId, options.sessionId, options.ready],
    ([projectId, sessionId, ready]) => {
      dismiss();
      if (!projectId || !sessionId || !ready || !options.fresh()) return;
      const key = `${projectId}:${sessionId}`;
      if (processed.has(key)) return;
      processed.add(key);
      const result = removeRecordingPauseGaps(options.composition.value, sessionId, options.zoomElements.value);
      if (!result.removedCount) return;
      options.commit(options.snapshot());
      options.composition.value = result.composition;
      options.zoomElements.value = result.zoomElements;
      expected.value = options.snapshot();
      options.commit(expected.value);
      notificationProject = projectId;
      options.save();
    },
    { immediate: true, flush: 'post' },
  );
  watch(
    [() => (expected.value ? options.snapshot() : null), options.presented, visible],
    ([snapshot, presented, isVisible]) => {
      if (!expected.value) return;
      // Never let a stale Restore action undo a subsequent user edit or another project.
      if (snapshot !== expected.value || options.projectId() !== notificationProject) return dismiss();
      if (!presented || !isVisible || toastId.value) return;
      const restoredSnapshot = expected.value;
      const restoredProject = notificationProject;
      toastId.value = toast.info(t('pauseGapsRemoved'), 5000, {
        label: t('restorePauseGaps'),
        onClick: async () => {
          if (
            expected.value !== restoredSnapshot ||
            options.snapshot() !== restoredSnapshot ||
            options.projectId() !== restoredProject
          )
            return;
          await options.undo();
          dismiss();
        },
      });
    },
    { immediate: true, flush: 'post' },
  );
  watch(
    () => toastId.value !== null && !toast.toasts.some((item) => item.id === toastId.value),
    (expired) => {
      if (expired) dismiss();
    },
  );
  const visibilityChanged = () => {
    visible.value = document.visibilityState === 'visible';
  };
  document.addEventListener('visibilitychange', visibilityChanged);
  onScopeDispose(() => {
    dismiss();
    document.removeEventListener('visibilitychange', visibilityChanged);
  });
}
