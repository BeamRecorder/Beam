import { onBeforeUnmount, ref, watch } from 'vue';
import { usePreferencesStore } from '~/stores/preferences';
import { useToastStore } from '~/ui/toast/toastStore';
import { useI18n } from 'vue-i18n';
import type { ScreenshotDockToolId } from './screenshot-dock-types';

import { SCREENSHOT_DOCK_KEY, DEFAULT_DOCK_TOOLS, readDockTools, reorderDockTool } from './screenshot-dock-model';

export function useScreenshotDock() {
  const preferences = usePreferencesStore(),
    toast = useToastStore(),
    { t } = useI18n();
  const read = () => readDockTools(preferences.settings?.extras?.[SCREENSHOT_DOCK_KEY]);
  const pinned = ref(read());
  let queue = Promise.resolve(),
    pending = 0,
    disposed = false;
  watch(
    () => preferences.settings?.extras?.[SCREENSHOT_DOCK_KEY],
    () => {
      if (!pending) pinned.value = read();
    },
  );
  const save = (tools: ScreenshotDockToolId[]) => {
    pinned.value = tools;
    pending++;
    queue = queue.then(async () => {
      try {
        await preferences.update({ extras: { [SCREENSHOT_DOCK_KEY]: tools } });
      } catch (error) {
        toast.add(`${t('Onboarding.saveError')}${error instanceof Error ? ` ${error.message}` : ''}`, 'error');
      } finally {
        pending--;
        if (!pending && !disposed) pinned.value = read();
      }
    });
  };
  const pin = (id: ScreenshotDockToolId) => {
    if (!pinned.value.includes(id)) save([...pinned.value, id]);
  };
  const remove = (id: ScreenshotDockToolId) => save(pinned.value.filter((item) => item !== id));
  const reset = () => save([...DEFAULT_DOCK_TOOLS]);
  const reorder = (id: ScreenshotDockToolId, boundary: number) => {
    const next = reorderDockTool(pinned.value, id, boundary);
    if (next) save(next);
  };
  onBeforeUnmount(() => {
    disposed = true;
  });
  return { pinned, pin, remove, reset, reorder };
}
