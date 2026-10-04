import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { capture } from '~/api/capture';
import type { CaptureProject } from '~/api/types/capture-api';
import type { EditorLoadingProgress, EditorOpenOptions } from '~/api/types/editor-window';

/** Owns an opening attempt, including project resolution before a native window exists. */
export function useEditorOpening() {
  const preparing = ref(false);
  const project = shallowRef<CaptureProject | null>(null);
  const progress = ref<EditorLoadingProgress>({
    stage: 'openingWindow',
    value: 10,
  });
  let generation = 0;
  const isCurrent = (attempt: number) => attempt === generation;
  const begin = () => {
    preparing.value = true;
    progress.value = { stage: 'openingWindow', value: 10 };
    return ++generation;
  };
  const open = async (nextProject: CaptureProject, options: EditorOpenOptions, attempt: number) => {
    if (!isCurrent(attempt)) return false;
    project.value = nextProject;
    capture.hideTeleprompter();
    capture.setCameraOverlayActive(false);
    const presented =
      nextProject.mode === 'screenshot'
        ? await capture.openScreenshot(nextProject.id)
        : await capture.openEditor(nextProject.id, options);
    if (!isCurrent(attempt)) return false;
    preparing.value = false;
    return presented;
  };
  const cancel = async () => {
    if (!preparing.value) return false;
    const cancelled = ++generation;
    preparing.value = false;
    // Invalidate first: a project lookup or open promise can finish during IPC.
    try {
      return await capture.cancelEditorOpening();
    } catch (error) {
      if (isCurrent(cancelled)) throw error;
      return false;
    } finally {
      if (isCurrent(cancelled)) {
        capture.setCameraOverlayActive(true);
        capture.showHud();
      }
    }
  };
  onBeforeUnmount(() => ++generation);
  return { preparing, project, progress, begin, isCurrent, open, cancel };
}
