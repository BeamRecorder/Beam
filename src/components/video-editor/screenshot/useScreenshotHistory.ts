import { nextTick, watch, type Ref } from 'vue';
import type { ScreenshotHistoryOptions } from './screenshot-types';
import type { ScreenshotState } from '~/api/types/screenshot';
import { propertyInteractionActive } from '~/composables/property-interaction';
import { useEditorUndoRedo } from '../composables/useEditorUndoRedo';

export function useScreenshotHistory(state: Ref<ScreenshotState | null>, options: ScreenshotHistoryOptions) {
  const history = useEditorUndoRedo<ScreenshotState>({
    disabled: () => options.disabled() || propertyInteractionActive.value,
    onRestoreSnapshot: async (snapshot) => {
      state.value = snapshot;
      options.restore();
      // Let dependent state watchers settle before releasing the restore guard.
      await nextTick();
    },
  });
  watch(
    [state, propertyInteractionActive],
    () => {
      if (state.value && !propertyInteractionActive.value && !history.restoring.value) history.commitNow(state.value);
    },
    { deep: true, flush: 'post' },
  );
  return history;
}
