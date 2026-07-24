import { computed, onMounted, onUnmounted, ref, toRaw } from "vue";
import { capture } from "../../../../api/capture";
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  customColor,
  customGradient,
  type BackgroundValue,
  type GradientBackground,
} from "../../composables/backgroundCatalog";

type PresetOverride = string | GradientBackground;

export function useBackgroundPresets(select: (value: BackgroundValue) => void) {
  const customColorValue = ref("#4f46e5");
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
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, PresetOverride> : {};
  });
  const isGradient = (value: PresetOverride | undefined): value is GradientBackground => Boolean(value && typeof value === "object" && Array.isArray((value as GradientBackground).stops));
  const colorOverride = (value: PresetOverride | undefined) => typeof value === "string" ? value : undefined;
  const colorPresets = computed(() => [
    ...BACKGROUND_COLORS.map((item) => ({ ...item, color: colorOverride(overrides.value[item.id]) ?? item.color })),
    ...savedColors.value.map(customColor),
  ]);
  const gradientPresets = computed(() => [
    ...BACKGROUND_GRADIENTS.map((item) => ({ ...item, gradient: isGradient(overrides.value[item.id]) ? cloneGradient(overrides.value[item.id]) : item.gradient })),
    ...savedGradients.value.map((gradient, index) => ({ ...customGradient(gradient), id: `gradient:custom:${index}` })),
  ]);
  const sync = (preferences: Awaited<ReturnType<typeof capture.getPreferences>>) => {
    savedColors.value = preferences.backgroundPresets.colors;
    savedGradients.value = preferences.backgroundPresets.gradients;
    savedExtras.value = preferences.extras;
  };
  const save = async (colors: string[], gradients: GradientBackground[], nextOverrides = overrides.value) => {
    sync(await capture.updatePreferences({ backgroundPresets: { colors, gradients }, extras: { ...savedExtras.value, backgroundPresetOverrides: structuredClone(nextOverrides) } }));
  };
  const editColor = (item: { id: string; color: string }) => { editingPresetId.value = item.id; customColorValue.value = item.color; showCustomEditor.value = true; };
  const editGradient = (item: { id: string; gradient: GradientBackground }) => { editingPresetId.value = item.id; customGradientValue.value = cloneGradient(item.gradient); showCustomEditor.value = true; };
  const close = () => { editingPresetId.value = null; showCustomEditor.value = false; };
  const saveColor = async (color: string) => {
    const normalized = color.toLowerCase(); const editing = editingPresetId.value; const builtIn = BACKGROUND_COLORS.find((item) => item.id === editing);
    const colors = builtIn ? [...savedColors.value] : editing?.startsWith("color:custom:") ? savedColors.value.map((item) => item === editing.slice(13) ? normalized : item) : [...new Set([...savedColors.value, normalized])];
    await save(colors, structuredClone(toRaw(savedGradients.value)), { ...overrides.value, ...(builtIn && editing ? { [editing]: normalized } : {}) });
    select(builtIn ? { ...builtIn, color: normalized } : customColor(normalized)); close();
  };
  const saveGradient = async (gradient: GradientBackground) => {
    const editing = editingPresetId.value; const builtIn = BACKGROUND_GRADIENTS.find((item) => item.id === editing); const index = editing?.startsWith("gradient:custom:") ? Number(editing.slice(16)) : -1;
    const gradients = Number.isInteger(index) && index >= 0 ? savedGradients.value.map((item, position) => position === index ? cloneGradient(gradient) : cloneGradient(item)) : [...savedGradients.value.map(cloneGradient), cloneGradient(gradient)];
    await save([...savedColors.value], gradients, { ...overrides.value, ...(builtIn && editing ? { [editing]: cloneGradient(gradient) } : {}) });
    select(builtIn ? { ...builtIn, gradient: cloneGradient(gradient) } : customGradient(gradient)); close();
  };

  onMounted(() => { void capture.getPreferences().then(sync).catch(() => undefined); unsubscribe = capture.onPreferencesChanged(sync); });
  onUnmounted(() => unsubscribe?.());
  return { colorPresets, gradientPresets, customColorValue, customGradientValue, showCustomEditor, editColor, editGradient, close, saveColor, saveGradient };
}
