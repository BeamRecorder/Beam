<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { DEFAULT_DITHERING_RECIPE } from '@beam/engine';
import type { DitheringEffect, DitheringRecipe } from '@beam/engine/gradient/dithering-effect-types';
import type { DitheringPanelProps } from './gradient-panel-types';
import ScreenshotOpacity from '../composition/ScreenshotOpacity.vue';
const props = defineProps<DitheringPanelProps>();
const emit = defineEmits<{ update: [patch: Partial<DitheringEffect>]; remove: []; back: [] }>();
const { t } = useTranslate('DitheringEffect');
const { t: common } = useTranslate('GradientEffect');
const { t: colorText } = useTranslate('ColorEffect');
const options = [2, 4, 8].map((value) => ({ value, label: `${value} × ${value}` }));
const algorithms = computed(() => [
  { value: 'bayer', label: t('ordered') },
  { value: 'jarvis-judice-ninke', label: 'Jarvis–Judice–Ninke' },
]);
const mappings = computed(() => [
  { value: 'color', label: t('nearestColors') },
  { value: 'luminance', label: t('luminance') },
]);
const numeric = (key: 'blockSize' | 'brightness' | 'contrast', value: number) => {
  if (Number.isFinite(value))
    recipe({
      [key]: Math.max(
        key === 'blockSize' ? 1 : 0,
        Math.min(key === 'blockSize' ? 16 : 200, key === 'blockSize' ? Math.round(value) : value),
      ),
    });
};
const algorithm = (value: string | number) => {
  if (value === 'bayer' || value === 'jarvis-judice-ninke') recipe({ algorithm: value });
};
const mapping = (value: string | number) => {
  if (value === 'color' || value === 'luminance') recipe({ mapping: value });
};
const presets = computed(() => [
  { name: colorText('monochrome'), colors: ['#000000', '#ffffff'] },
  { name: t('fourTones'), colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'] },
  { name: t('retro'), colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
]);
const update = (patch: Partial<DitheringEffect>) => {
  if (!props.disabled) emit('update', patch);
};
const recipe = (patch: Partial<DitheringRecipe>) => update({ recipe: { ...props.effect.recipe, ...patch } });
const setColor = (index: number, value: string) => {
  if (!/^#[\da-f]{6}$/i.test(value)) return;
  recipe({ colors: props.effect.recipe.colors.map((color, at) => (at === index ? value : color)) });
};
const pixelSize = (value: number) => {
  if (Number.isFinite(value)) recipe({ pixelSize: Math.max(1, Math.min(16, value)) });
};
const matrixSize = (value: string | number) => {
  if (value === 2 || value === 4 || value === 8) recipe({ matrixSize: value });
};
</script>
<template>
  <fieldset class="dithering-panel" :disabled="disabled" :inert="disabled || undefined" :aria-label="t('title')">
    <div class="effect-heading">
      <Button
        size="xs"
        icon-only
        variant="ghost"
        :icon="ArrowLeft"
        :aria-label="common('back')"
        @click="emit('back')"
      />
      <strong>{{ t('title') }}</strong>
      <Switch
        :model-value="effect.enabled"
        :disabled="disabled"
        :aria-label="common('enabled')"
        @update:model-value="update({ enabled: $event })"
      />
      <Button
        size="xs"
        icon-only
        variant="ghost"
        :icon="Trash2"
        :disabled="disabled"
        :aria-label="common('remove')"
        @click="!disabled && emit('remove')"
      />
    </div>
    <ScreenshotOpacity
      :model-value="effect.opacity"
      :disabled="disabled"
      @update:model-value="update({ opacity: $event })"
    />
    <label class="pattern-control"
      ><span>{{ t('algorithm') }}</span
      ><Select
        :model-value="effect.recipe.algorithm"
        :options="algorithms"
        :aria-label="t('algorithm')"
        :disabled="disabled"
        @update:model-value="algorithm"
    /></label>
    <label class="pattern-control"
      ><span>{{ t('mapping') }}</span
      ><Select
        :model-value="effect.recipe.mapping"
        :options="mappings"
        :aria-label="t('mapping')"
        :disabled="disabled"
        @update:model-value="mapping"
    /></label>
    <label v-if="effect.recipe.algorithm === 'bayer'" class="pattern-control"
      ><span>{{ t('pattern') }}</span>
      <Select
        :model-value="effect.recipe.matrixSize"
        :options="options"
        :aria-label="t('pattern')"
        :disabled="disabled"
        @update:model-value="matrixSize"
      />
    </label>
    <BigSlider
      v-if="effect.recipe.algorithm === 'bayer'"
      :model-value="effect.recipe.pixelSize"
      :label="t('pixelSize')"
      :min="1"
      :max="16"
      :step="1"
      :default-value="1"
      :disabled="disabled"
      @update:model-value="pixelSize"
    />
    <BigSlider
      :model-value="effect.recipe.blockSize"
      :label="t('blockSize')"
      :min="1"
      :max="16"
      :step="1"
      :disabled="disabled"
      @update:model-value="numeric('blockSize', $event)"
    />
    <BigSlider
      v-for="key in ['brightness', 'contrast'] as const"
      :key="key"
      :model-value="effect.recipe[key]"
      :label="colorText(key)"
      :min="0"
      :max="200"
      :step="1"
      :default-value="100"
      :disabled="disabled"
      @update:model-value="numeric(key, $event)"
    />
    <strong class="palette-title">{{ common('palette') }}</strong>
    <div class="palette-presets">
      <Button
        v-for="preset in presets"
        :key="preset.name"
        size="sm"
        variant="secondary"
        :disabled="disabled"
        @click="recipe({ colors: [...preset.colors] })"
        >{{ preset.name }}</Button
      >
    </div>
    <ColorPicker
      v-for="(color, index) in effect.recipe.colors"
      :key="index"
      :model-value="color"
      :label="`${common('palette')} ${index + 1}`"
      show-label
      :disabled="disabled"
      @update:model-value="setColor(index, $event)"
    />
    <Button
      size="sm"
      variant="secondary"
      :disabled="disabled"
      @click="recipe({ ...DEFAULT_DITHERING_RECIPE, colors: [...DEFAULT_DITHERING_RECIPE.colors] })"
      >{{ colorText('reset') }}</Button
    >
  </fieldset>
</template>
<style scoped>
.dithering-panel {
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
.pattern-control {
  display: grid;
  grid-template-columns: 1fr 104px;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
.palette-title {
  font-size: 12px;
  color: var(--text-primary);
}
.palette-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
