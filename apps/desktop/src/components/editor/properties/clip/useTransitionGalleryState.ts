import { ref, watch } from 'vue';
import type { TransitionGalleryMemory } from './transition-gallery-types';
import { usePreferencesStore } from '~/stores/preferences';
import { TRANSITION_CATEGORIES } from '@beam/engine/shared/transition-presets';

const key = 'editor.transitionCategory';
const states = new WeakMap<object, TransitionGalleryMemory>();
const valid = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && TRANSITION_CATEGORIES.some((category) => category.id === value));

/** UI navigation belongs to preferences, never to document history or a clip's settings. */
export function useTransitionGalleryState() {
  const preferences = usePreferencesStore();
  const saved = preferences.settings?.extras?.[key];
  let memory = states.get(preferences);
  if (!memory) {
    memory = { category: ref(valid(saved) ? saved : 'basics'), pending: 0, saving: Promise.resolve() };
    states.set(preferences, memory);
  } else if (!memory.pending && valid(saved)) {
    memory.category.value = saved;
  }
  const state = memory;
  watch(
    () => preferences.settings?.extras?.[key],
    (value) => {
      if (!state.pending && valid(value)) state.category.value = value;
    },
  );
  const setCategory = (value: string | null) => {
    if (!valid(value) || value === state.category.value) return;
    state.category.value = value;
    state.pending++;
    state.saving = state.saving
      .then(async () => {
        await preferences.update({ extras: { [key]: value } });
      })
      .catch((error: unknown) => console.error('Cannot save transition gallery category.', error))
      .finally(() => {
        state.pending--;
      });
  };
  return { category: state.category, setCategory };
}
