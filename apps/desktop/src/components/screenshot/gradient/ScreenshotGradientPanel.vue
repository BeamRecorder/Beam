<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowLeft, Trash2 } from '@lucide/vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Select from '~/ui/select/Select.vue';
import Gradient from '~/ui/Gradient/Gradient.vue';
import type { GradientValue } from '~/ui/Gradient/gradient-types';
import ScreenshotGradientPreview from './ScreenshotGradientPreview.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { DEFAULT_GRADIENT_RECIPE, GRADIENT_RANGES, GRADIENT_PRESETS } from '@beam/engine';
import ScreenshotLayerControls from '../composition/ScreenshotLayerControls.vue';
import type {
  GradientLayerEffect,
  GradientNumberKey,
  GradientRecipe,
  GradientMode,
} from '@beam/engine/gradient/gradient-types';
import type { GradientPanelProps } from './gradient-panel-types';
import { GRADIENT_CONTROL_GROUPS, gradientControlStep } from './gradient-controls';
const props = defineProps<GradientPanelProps>();
const emit = defineEmits<{ update: [patch: Partial<GradientLayerEffect>]; remove: []; back: [] }>();
const { t } = useTranslate('GradientEffect');
const open = ref<Record<string, boolean>>({ palette: true, surface: true });
const modeOptions = computed(() => ['mesh', 'flow', 'silk'].map((value) => ({ value, label: t(value) })));
const update = (patch: Partial<GradientLayerEffect>) => {
  if (!props.disabled) emit('update', patch);
};
const recipe = (patch: Partial<GradientRecipe>) => update({ recipe: { ...props.effect.recipe, ...patch } });
const applyPreset = (value: GradientRecipe) => recipe(structuredClone(value));
const numeric = (key: GradientNumberKey, value: number) =>
  recipe({
    [key]: Math.max(
      GRADIENT_RANGES[key][0],
      Math.min(GRADIENT_RANGES[key][1], ['seed', 'octaves'].includes(key) ? Math.round(value) : value),
    ),
  });
const palette = ref<GradientValue>({ stops: [] });
watch(
  () => props.effect.recipe.colors,
  (colors) => {
    if (
      colors.length === palette.value.stops.length &&
      colors.every((color, index) => color === palette.value.stops[index]!.color)
    )
      return;
    palette.value = {
      stops: colors.map((color, index) => ({
        id: String(index),
        position: index / (colors.length - 1),
        color,
        alpha: 1,
      })),
    };
  },
  { deep: true, immediate: true },
);
const updatePalette = (value: GradientValue) => {
  if (
    props.disabled ||
    value.stops.length < 2 ||
    value.stops.length > 8 ||
    value.stops.some((stop) => !/^#[\da-f]{6}$/i.test(stop.color))
  )
    return;
  palette.value = value;
  recipe({ colors: value.stops.map((stop) => stop.color) });
};
</script>
<template>
  <fieldset class="gradient-panel" :disabled="disabled" :inert="disabled || undefined" :aria-label="t('title')">
    <div class="effect-heading">
      <Button size="xs" icon-only variant="ghost" :icon="ArrowLeft" :aria-label="t('back')" @click="emit('back')" />
      <strong>{{ t('title') }}</strong>
      <Switch
        :model-value="effect.enabled"
        :aria-label="t('enabled')"
        :disabled="disabled"
        @update:model-value="update({ enabled: $event })"
      />
      <Button
        size="xs"
        icon-only
        variant="ghost"
        :icon="Trash2"
        :disabled="disabled"
        :aria-label="t('remove')"
        @click="!disabled && emit('remove')"
      />
    </div>
    <ScreenshotLayerControls :layer="{ ...effect, locked: false }" :disabled="disabled" @update="update($event)" />
    <Accordion v-model="open.palette" appearance="inspector" :title="t('palette')">
      <div class="control-stack">
        <ButtonGroup full :columns="2">
          <Button
            v-for="preset in GRADIENT_PRESETS"
            :key="preset.id"
            size="sm"
            :disabled="disabled"
            :variant="JSON.stringify(effect.recipe) === JSON.stringify(preset.recipe) ? 'selected' : 'secondary'"
            @click="applyPreset(preset.recipe)"
          >
            <span class="palette-swatches" aria-hidden="true"
              ><span v-for="value in preset.recipe.colors" :key="value" :style="{ backgroundColor: value }" /></span
            >{{ preset.name }}
          </Button>
        </ButtonGroup>
        <Select
          :model-value="effect.recipe.mode"
          :options="modeOptions"
          :aria-label="t('mode')"
          :disabled="disabled"
          @update:model-value="recipe({ mode: $event as GradientMode })"
        />
        <ColorPicker
          :model-value="effect.recipe.background"
          :label="t('background')"
          show-label
          :disabled="disabled"
          @update:model-value="recipe({ background: $event })"
        />
        <Gradient
          :model-value="palette"
          palette
          :min-stops="2"
          :max-stops="8"
          :disabled="disabled"
          @update:model-value="updatePalette"
        >
          <template #preview><ScreenshotGradientPreview :recipe="effect.recipe" /></template>
        </Gradient>
      </div>
    </Accordion>
    <Accordion
      v-for="group in GRADIENT_CONTROL_GROUPS"
      :key="group.id"
      v-model="open[group.id]"
      appearance="inspector"
      :title="t(group.id)"
      :data-gradient-section="group.id"
    >
      <div class="control-stack">
        <BigSlider
          v-for="key in group.keys"
          :key="key"
          :model-value="effect.recipe[key]"
          :label="t(key)"
          :min="GRADIENT_RANGES[key][0]"
          :max="GRADIENT_RANGES[key][1]"
          :step="gradientControlStep(key)"
          :default-value="DEFAULT_GRADIENT_RECIPE[key]"
          @update:model-value="numeric(key, $event)"
        />
      </div>
    </Accordion>
  </fieldset>
</template>
<style scoped>
.gradient-panel {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: grid;
  gap: 12px;
}
.effect-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}
.effect-heading strong {
  flex: 1;
  font-size: 12px;
  color: var(--text-primary);
}
.control-stack {
  display: grid;
  gap: 12px;
}
.palette-swatches {
  display: flex;
  overflow: hidden;
  border-radius: var(--radius-sm);
  width: 28px;
  height: 16px;
  flex-shrink: 0;
}
.palette-swatches span {
  flex: 1;
}
</style>
