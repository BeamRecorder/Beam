import { onScopeDispose, type Ref } from 'vue';
import type { BackgroundMedia } from '@beam/engine/shared/background-types';
import type { EditorResources } from '../editor/resources/editor-resource-types';

export function useScreenshotBackgroundLibrary(
  resources: Pick<EditorResources, 'onBackgroundsChanged' | 'backgrounds'>,
  library: Ref<BackgroundMedia[]>,
  fail: (reason: unknown) => void,
) {
  let disposed = false,
    generation = 0;
  const stop = resources.onBackgroundsChanged(() => {
    const current = ++generation;
    void resources
      .backgrounds()
      .then((next) => {
        if (!disposed && current === generation) library.value = next;
      })
      .catch((reason: unknown) => {
        if (!disposed && current === generation) fail(reason);
      });
  });
  onScopeDispose(() => {
    disposed = true;
    stop();
  });
}
