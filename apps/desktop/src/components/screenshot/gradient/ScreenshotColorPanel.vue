<script setup lang="ts">
import { ref } from 'vue';
import { ArrowLeft, Trash2 } from '@lucide/vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import Switch from '~/ui/switch/Switch.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { COLOR_RANGES, DEFAULT_COLOR_RECIPE } from '@beam/engine';
import type { ColorAdjustmentKey, ColorAdjustmentEffect } from '@beam/engine/gradient/color-effect-types';
import type { ColorPanelProps } from './gradient-panel-types';
import ScreenshotOpacity from '../composition/ScreenshotOpacity.vue';
const props = defineProps<ColorPanelProps>();
const emit = defineEmits<{ update: [patch: Partial<ColorAdjustmentEffect>]; remove: []; back: [] }>();
const { t } = useTranslate('ColorEffect');
const { t: gradientText } = useTranslate('GradientEffect');
const open = ref(true);
const keys = Object.keys(COLOR_RANGES) as ColorAdjustmentKey[];
const update = (patch: Partial<ColorAdjustmentEffect>) => {
  if (!props.disabled) emit('update', patch);
};
const numeric = (key: ColorAdjustmentKey, raw: string | number) => {
  const value = Number(raw);
  if (!String(raw).trim() || !Number.isFinite(value)) return;
  update({
    recipe: { ...props.effect.recipe, [key]: Math.max(COLOR_RANGES[key][0], Math.min(COLOR_RANGES[key][1], value)) },
  });
};
</script>
<template>
  <fieldset class="color-panel" :disabled="disabled" :inert="disabled || undefined" :aria-label="t('title')">
    <div class="effect-heading">
      <Button
        size="xs"
        icon-only
        variant="ghost"
        :icon="ArrowLeft"
        :aria-label="gradientText('back')"
        @click="emit('back')"
      />
      <strong>{{ t('title') }}</strong>
      <Switch
        :model-value="effect.enabled"
        :disabled="disabled"
        :aria-label="t('enabled')"
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
    <ScreenshotOpacity
      :model-value="effect.opacity"
      :disabled="disabled"
      @update:model-value="update({ opacity: $event })"
    />
    <Accordion v-model="open" appearance="inspector" :title="t('adjustments')">
      <div class="color-controls">
        <label v-for="key in keys" :key="key" class="color-control">
          <span>{{ t(key) }}</span>
          <Input
            :model-value="effect.recipe[key]"
            type="number"
            commit-on-blur
            size="sm"
            :min="COLOR_RANGES[key][0]"
            :max="COLOR_RANGES[key][1]"
            :step="1"
            :aria-label="t(key)"
            :disabled="disabled"
            :unit="key === 'hue' ? '°' : '%'"
            @update:model-value="numeric(key, $event)"
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          :disabled="disabled"
          @click="update({ recipe: { ...DEFAULT_COLOR_RECIPE } })"
          >{{ t('reset') }}</Button
        >
      </div>
    </Accordion>
  </fieldset>
</template>
<style scoped>
.color-panel {
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
.color-controls {
  display: grid;
  gap: 8px;
}
.color-control {
  display: grid;
  grid-template-columns: 1fr 104px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
