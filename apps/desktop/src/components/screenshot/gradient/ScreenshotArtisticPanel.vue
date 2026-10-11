<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeft, Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import Switch from '~/ui/switch/Switch.vue';
import { ARTISTIC_DEFAULTS, ARTISTIC_RANGES } from '@beam/engine';
import type { ArtisticEffect } from '@beam/engine/gradient/artistic-effect-types';
import type { ArtisticPanelProps } from './gradient-panel-types';
import { useTranslate } from '~/i18n/useTranslate';
import ScreenshotOpacity from '../composition/ScreenshotOpacity.vue';
const props = defineProps<ArtisticPanelProps>();
const emit = defineEmits<{ update: [patch: Partial<ArtisticEffect>]; remove: []; back: [] }>();
const { t } = useTranslate('ArtisticEffect');
const { t: common } = useTranslate('GradientEffect');
const { t: colorText } = useTranslate('ColorEffect');
const fields = computed(() =>
  Object.entries(props.effect.recipe).filter(
    ([key]) =>
      key !== 'version' && !(key === 'foreground' && props.effect.kind === 'ascii' && props.effect.recipe.colored),
  ),
);
const ranges = computed(
  () => ARTISTIC_RANGES[props.effect.kind] as Readonly<Record<string, readonly [number, number]>>,
);
const label = (key: string) =>
  ['brightness', 'contrast'].includes(key) ? colorText(key) : ['seed', 'exposure'].includes(key) ? common(key) : t(key);
const update = (patch: Partial<ArtisticEffect>) => {
  if (!props.disabled) emit('update', patch);
};
const recipe = (key: string, value: unknown) => {
  const range = ranges.value[key];
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !range) return;
    value = Math.max(range[0], Math.min(range[1], key === 'seed' ? Math.round(value) : value));
  }
  if (typeof value === 'string' && !/^#[\da-f]{6}$/i.test(value)) return;
  update({ recipe: { ...props.effect.recipe, [key]: value } } as Partial<ArtisticEffect>);
};
</script>
<template>
  <fieldset class="artistic-panel" :disabled="disabled" :inert="disabled || undefined" :aria-label="t(effect.kind)">
    <div class="effect-heading">
      <Button
        size="xs"
        icon-only
        variant="ghost"
        :icon="ArrowLeft"
        :aria-label="common('back')"
        @click="emit('back')"
      />
      <strong>{{ t(effect.kind) }}</strong>
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
    <template v-for="[key, value] in fields" :key="key">
      <BigSlider
        v-if="typeof value === 'number'"
        :model-value="value"
        :label="label(key)"
        :min="ranges[key]![0]"
        :max="ranges[key]![1]"
        :step="key === 'size' ? 0.5 : 1"
        :disabled="disabled"
        @update:model-value="recipe(key, $event)"
      />
      <ColorPicker
        v-else-if="typeof value === 'string'"
        :model-value="value"
        :label="label(key)"
        show-label
        :disabled="disabled"
        @update:model-value="recipe(key, $event)"
      />
      <label v-else class="toggle-control"
        ><span>{{ label(key) }}</span
        ><Switch
          :model-value="value"
          :disabled="disabled"
          :aria-label="label(key)"
          @update:model-value="recipe(key, $event)"
      /></label>
    </template>
    <Button
      size="sm"
      variant="secondary"
      :disabled="disabled"
      @click="update({ recipe: { ...ARTISTIC_DEFAULTS[effect.kind] } } as Partial<ArtisticEffect>)"
      >{{ colorText('reset') }}</Button
    >
  </fieldset>
</template>
<style scoped>
.artistic-panel {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: grid;
  gap: 16px;
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
.toggle-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
