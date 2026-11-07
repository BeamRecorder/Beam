import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePreferencesStore } from '~/stores/preferences';
import { useToastStore } from '~/ui/toast/toastStore';
import { SCREENSHOT_PROPERTIES_POSITION_KEY, readScreenshotPropertiesPosition } from './screenshot-properties-position';
import type { ScreenshotPropertiesPosition } from './screenshot-properties-types';

export function useScreenshotPropertiesDock() {
  const preferences = usePreferencesStore();
  const toast = useToastStore();
  const { t } = useI18n();
  const read = () =>
    readScreenshotPropertiesPosition(preferences.settings?.extras?.[SCREENSHOT_PROPERTIES_POSITION_KEY]);
  const position = ref(read());
  const saving = ref(false);
  watch(
    () => preferences.settings?.extras?.[SCREENSHOT_PROPERTIES_POSITION_KEY],
    () => {
      if (!saving.value) position.value = read();
    },
  );
  const setPosition = async (next: ScreenshotPropertiesPosition) => {
    if (saving.value || next === position.value) return;
    position.value = next;
    saving.value = true;
    try {
      await preferences.update({ extras: { [SCREENSHOT_PROPERTIES_POSITION_KEY]: next } });
    } catch (error) {
      toast.add(`${t('Onboarding.saveError')}${error instanceof Error ? ` ${error.message}` : ''}`, 'error');
    } finally {
      saving.value = false;
      position.value = read();
    }
  };
  return { position, saving, setPosition };
}
