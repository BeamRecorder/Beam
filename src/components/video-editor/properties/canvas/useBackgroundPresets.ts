import { computed, onMounted, onUnmounted, ref, toRaw } from 'vue';
import { capture } from '../../../../api/capture';
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  customColor,
  customGradient,
  type BackgroundValue,
  type GradientBackground,
} from '../../composables/backgroundCatalog';

type PresetOverride = string | GradientBackground;

const plainClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const randomColor = () =>
  `#${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, '0')}`;
const randomGradient = (): GradientBackground => ({
  type: 'linear',
  angle: Math.round(Math.random() * 359),
  stops: [
    { id: crypto.randomUUID(), position: 0, color: randomColor(), alpha: 1 },
    { id: crypto.randomUUID(), position: 1, color: randomColor(), alpha: 1 },
  ],
});

export function useBackgroundPresets(select: (value: BackgroundValue) => void) {
  const customColorValue = ref('#4f46e5');
  const customGradientValue = ref<GradientBackground>(structuredClone(BACKGROUND_GRADIENTS[0].gradient));
  const savedColors = ref<string[]>([]);
  const savedGradients = ref<GradientBackground[]>([]);
  const savedExtras = ref<Record<string, unknown>>({});
  const showCustomEditor = ref(false);
  const editingPresetId = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;

  const cloneGradient = (value: GradientBackground) => structuredClone(toRaw(value));
  const overrides = computed<Record<string, PresetOverride>>(() => {
    const value = savedExtras.value.backgroundPresetOverrides;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, PresetOverride>) : {};
  });
  const isGradient = (value: PresetOverride | undefined): value is GradientBackground =>
    Boolean(value && typeof value === 'object' && Array.isArray((value as GradientBackground).stops));
  const colorOverride = (value: PresetOverride | undefined) => (typeof value === 'string' ? value : undefined);
  const colorPresets = computed(() => [
    ...BACKGROUND_COLORS.map((item) => ({ ...item, color: colorOverride(overrides.value[item.id]) ?? item.color })),
    ...savedColors.value.map(customColor),
  ]);
  const gradientPresets = computed(() => [
    ...BACKGROUND_GRADIENTS.map((item) => {
      const override = overrides.value[item.id];
      return { ...item, gradient: isGradient(override) ? cloneGradient(override) : item.gradient };
    }),
    ...savedGradients.value.map((gradient, index) => ({ ...customGradient(gradient), id: `gradient:custom:${index}` })),
  ]);
  const sync = (preferences: Awaited<ReturnType<typeof capture.getPreferences>>) => {
    savedColors.value = preferences.backgroundPresets.colors;
    savedGradients.value = preferences.backgroundPresets.gradients;
    savedExtras.value = preferences.extras;
  };
  const save = async (colors: string[], gradients: GradientBackground[], nextOverrides = overrides.value) => {
    const extras = plainClone(savedExtras.value);
    sync(
      await capture.updatePreferences({
        backgroundPresets: plainClone({ colors, gradients }),
        extras: { ...extras, backgroundPresetOverrides: plainClone(nextOverrides) },
      }),
    );
  };
  const editColor = (item: { id: string; color: string }) => {
    editingPresetId.value = item.id;
    customColorValue.value = item.color;
    showCustomEditor.value = true;
  };
  const editGradient = (item: { id: string; gradient: GradientBackground }) => {
    editingPresetId.value = item.id;
    customGradientValue.value = cloneGradient(item.gradient);
    showCustomEditor.value = true;
  };
  const close = () => {
    editingPresetId.value = null;
    showCustomEditor.value = false;
  };
  const isEditing = (id: string) => showCustomEditor.value && editingPresetId.value === id;
  const toggleColor = (item: { id: string; color: string }) => (isEditing(item.id) ? close() : editColor(item));
  const toggleGradient = (item: { id: string; gradient: GradientBackground }) =>
    isEditing(item.id) ? close() : editGradient(item);
  const beginAdd = (kind: 'color' | 'gradient') => {
    editingPresetId.value = null;
    showCustomEditor.value = true;
    if (kind === 'color') customColorValue.value = randomColor();
    else customGradientValue.value = randomGradient();
  };
  const saveColor = async (color: string) => {
    const normalized = color.toLowerCase();
    const editing = editingPresetId.value;
    const builtIn = BACKGROUND_COLORS.find((item) => item.id === editing);
    const colors = builtIn
      ? [...savedColors.value]
      : editing?.startsWith('color:custom:')
        ? savedColors.value.map((item) => (item === editing.slice(13) ? normalized : item))
        : [...new Set([...savedColors.value, normalized])];
    await save(colors, structuredClone(toRaw(savedGradients.value)), {
      ...overrides.value,
      ...(builtIn && editing ? { [editing]: normalized } : {}),
    });
    select(builtIn ? { ...builtIn, color: normalized } : customColor(normalized));
    close();
  };
  const saveGradient = async (gradient: GradientBackground) => {
    const editing = editingPresetId.value;
    const builtIn = BACKGROUND_GRADIENTS.find((item) => item.id === editing);
    const index = editing?.startsWith('gradient:custom:') ? Number(editing.slice(16)) : -1;
    const gradients =
      Number.isInteger(index) && index >= 0
        ? savedGradients.value.map((item, position) =>
            position === index ? cloneGradient(gradient) : cloneGradient(item),
          )
        : [...savedGradients.value.map(cloneGradient), cloneGradient(gradient)];
    await save([...savedColors.value], gradients, {
      ...overrides.value,
      ...(builtIn && editing ? { [editing]: cloneGradient(gradient) } : {}),
    });
    select(builtIn ? { ...builtIn, gradient: cloneGradient(gradient) } : customGradient(gradient));
    close();
  };

  const updateLiveColor = (color: string) => {
    const normalized = color.toLowerCase();
    customColorValue.value = normalized;
    const editing = editingPresetId.value;
    if (editing) {
      const builtIn = BACKGROUND_COLORS.find((item) => item.id === editing);
      if (builtIn) {
        savedExtras.value = {
          ...savedExtras.value,
          backgroundPresetOverrides: { ...overrides.value, [editing]: normalized },
        };
        select({ ...builtIn, color: normalized });
        return;
      }
      if (editing.startsWith('color:custom:')) {
        const targetColor = editing.slice(13);
        savedColors.value = savedColors.value.map((item) => (item === targetColor ? normalized : item));
        editingPresetId.value = `color:custom:${normalized}`;
        select(customColor(normalized));
        return;
      }
    }
    select(customColor(normalized));
  };
  const updateLiveGradient = (gradient: GradientBackground) => {
    const cloned = cloneGradient(gradient);
    customGradientValue.value = cloned;
    const editing = editingPresetId.value;
    if (editing) {
      const builtIn = BACKGROUND_GRADIENTS.find((item) => item.id === editing);
      if (builtIn) {
        savedExtras.value = {
          ...savedExtras.value,
          backgroundPresetOverrides: { ...overrides.value, [editing]: cloned },
        };
        select({ ...builtIn, gradient: cloned });
        return;
      }
      const index = editing.startsWith('gradient:custom:') ? Number(editing.slice(16)) : -1;
      if (Number.isInteger(index) && index >= 0) {
        savedGradients.value = savedGradients.value.map((item, pos) => (pos === index ? cloned : item));
        select({ ...customGradient(cloned), id: editing });
        return;
      }
    }
    select(customGradient(cloned));
  };

  onMounted(() => {
    void capture
      .getPreferences()
      .then(sync)
      .catch(() => undefined);
    unsubscribe = capture.onPreferencesChanged(sync);
  });
  onUnmounted(() => unsubscribe?.());
  return {
    colorPresets,
    gradientPresets,
    customColorValue,
    customGradientValue,
    showCustomEditor,
    editingPresetId,
    editColor,
    editGradient,
    toggleColor,
    toggleGradient,
    beginAdd,
    isEditing,
    close,
    saveColor,
    saveGradient,
    updateLiveColor,
    updateLiveGradient,
  };
}
