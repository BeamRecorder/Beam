import { computed, onMounted, ref } from 'vue';
import { usePreferencesStore } from '~/stores/preferences';
export function useTimelineInsertPreference() {
  const preferences = usePreferencesStore();
  const error = ref('');
  const saving = ref(false);
  const doubleClick = computed(() => preferences.settings?.extras.timelineInsertOnDoubleClick === true);
  onMounted(() => {
    if (!preferences.settings)
      void preferences.load().catch((reason) => {
        error.value = String(reason);
      });
  });
  const setDoubleClick = async (value: boolean) => {
    if (saving.value) return;
    saving.value = true;
    error.value = '';
    try {
      await preferences.update({
        extras: { timelineInsertOnDoubleClick: value },
      });
    } catch (reason) {
      error.value = String(reason);
    } finally {
      saving.value = false;
    }
  };
  const accepts = (event: MouseEvent) =>
    (event.detail === 0 && event.type === 'click') ||
    (doubleClick.value ? event.type === 'dblclick' : event.type === 'click' && event.detail < 2);
  return { doubleClick, setDoubleClick, accepts, error, saving };
}
