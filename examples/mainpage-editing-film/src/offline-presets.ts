import { computed, ref } from 'vue';
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  customColor,
  customGradient,
} from '../../../apps/desktop/src/components/editor/composables/backgroundCatalog';
import type { BackgroundValue, GradientBackground } from '@beam/engine/shared/background-types';

/** Local catalogue for the offline film host; no Electron preferences or preload. */
export function useBackgroundPresets(select: (value: BackgroundValue) => void) {
  const colorPresets = ref([...BACKGROUND_COLORS]);
  const gradientPresets = ref([...BACKGROUND_GRADIENTS]);
  const customColorValue = ref('#ff5a1f');
  const customGradientValue = ref<GradientBackground>(structuredClone(BACKGROUND_GRADIENTS[0]!.gradient));
  const showCustomEditor = ref(false),
    editingPresetId = ref<string | null>(null);
  const close = () => {
    showCustomEditor.value = false;
    editingPresetId.value = null;
  };
  const editColor = (value: BackgroundValue) => {
    if (value.kind === 'color') {
      customColorValue.value = value.color;
      editingPresetId.value = value.id;
      showCustomEditor.value = true;
    }
  };
  const editGradient = (value: BackgroundValue) => {
    if (value.kind === 'gradient') {
      customGradientValue.value = structuredClone(value.gradient);
      editingPresetId.value = value.id;
      showCustomEditor.value = true;
    }
  };
  return {
    colorPresets,
    gradientPresets,
    customColorValue,
    customGradientValue,
    showCustomEditor,
    editingPresetId,
    isEditing: computed(() => editingPresetId.value !== null),
    close,
    editColor,
    editGradient,
    toggleColor: editColor,
    toggleGradient: editGradient,
    beginAdd: () => {
      editingPresetId.value = null;
      showCustomEditor.value = true;
    },
    updateLiveColor: (color: string) => {
      customColorValue.value = color;
      select(customColor(color));
    },
    updateLiveGradient: (gradient: GradientBackground) => {
      customGradientValue.value = structuredClone(gradient);
      select(customGradient(gradient));
    },
    saveColor: async (color: string) => {
      const value = customColor(color);
      colorPresets.value = [...colorPresets.value.filter((entry) => entry.id !== editingPresetId.value), value];
      customColorValue.value = color;
      select(value);
      close();
    },
    saveGradient: async (gradient: GradientBackground) => {
      const value = customGradient(structuredClone(gradient));
      gradientPresets.value = [...gradientPresets.value.filter((entry) => entry.id !== editingPresetId.value), value];
      customGradientValue.value = structuredClone(gradient);
      select(value);
      close();
    },
  };
}
