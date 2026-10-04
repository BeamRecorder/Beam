<script setup lang="ts">
import { Minus } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Input from '~/ui/input/Input.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { GradientStop, GradientStopRowProps } from './gradient-types';

defineProps<GradientStopRowProps>();
const emit = defineEmits<{ select: []; update: [patch: Partial<Omit<GradientStop, 'id'>>]; remove: [] }>();
const { t } = useTranslate('Gradient');
</script>

<template>
  <div
    class="gradient-stop-row"
    :class="{ 'is-selected': selected, 'is-palette': palette }"
    @focusin="emit('select')"
    @pointerdown="emit('select')"
  >
    <ColorPicker
      :model-value="stop.color"
      :label="t('stopColor', { number: index + 1 })"
      :show-label="false"
      :show-alpha="!palette"
      :alpha-value="stop.alpha ?? 1"
      :disabled="disabled"
      @update:model-value="emit('update', { color: $event })"
      @update:alpha="emit('update', { alpha: $event })"
    />
    <Input
      v-if="!palette"
      type="number"
      size="xs"
      appearance="neutral"
      commit-on-blur
      :model-value="Number((stop.position * 100).toFixed(2))"
      :min="0"
      :max="100"
      :step="1"
      unit="%"
      :disabled="disabled"
      :aria-label="t('stopPosition', { number: index + 1 })"
      @update:model-value="emit('update', { position: Number($event) / 100 })"
    />
    <Input
      v-if="!palette"
      type="number"
      size="xs"
      appearance="neutral"
      commit-on-blur
      :model-value="Number(((stop.alpha ?? 1) * 100).toFixed(2))"
      :min="0"
      :max="100"
      :step="1"
      unit="%"
      :disabled="disabled"
      :aria-label="t('stopOpacity', { number: index + 1 })"
      @update:model-value="emit('update', { alpha: Number($event) / 100 })"
    />
    <Button
      variant="ghost"
      size="xs"
      icon-only
      :icon="Minus"
      :disabled="disabled || !removable"
      :tooltip="t('removeStop')"
      :aria-label="t('removeStop')"
      @click="emit('remove')"
    />
  </div>
</template>

<style scoped>
.gradient-stop-row {
  display: grid;
  grid-template-columns: minmax(72px, 1fr) 58px 58px 24px;
  gap: 4px;
  align-items: center;
  min-width: 0;
  padding: 5px 4px;
  border-radius: var(--radius-md);
}
.gradient-stop-row.is-palette {
  grid-template-columns: minmax(72px, 1fr) 24px;
}
.gradient-stop-row:hover {
  background: var(--color-bg-surface-hover);
}
.gradient-stop-row.is-selected {
  background: var(--color-bg-well);
}
</style>
