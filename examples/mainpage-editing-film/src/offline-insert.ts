import { ref } from 'vue';
/** Gesture preferences belong to this film's local host, outside native user settings. */
export function useTimelineInsertPreference() {
  const doubleClick = ref(false);
  return {
    doubleClick,
    error: ref(''),
    saving: ref(false),
    setDoubleClick: async (value: boolean) => {
      doubleClick.value = value;
    },
    accepts: (event: MouseEvent) =>
      (event.detail === 0 && event.type === 'click') ||
      (doubleClick.value ? event.type === 'dblclick' : event.type === 'click' && event.detail < 2),
  };
}
