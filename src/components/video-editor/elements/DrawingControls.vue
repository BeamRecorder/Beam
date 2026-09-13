<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue';
import type { DrawingSettings } from '~/media/shared/element-types';
import { useTranslate } from '~/i18n/useTranslate';
const props = defineProps<{ modelValue: DrawingSettings; hideColor?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: DrawingSettings] }>();
const { t } = useTranslate('Elements');
const update = (patch: Partial<DrawingSettings>) => emit('update:modelValue', { ...props.modelValue, ...patch });
</script>
<template>
  <div class="drawing-controls">
    <ColorPicker
      v-if="!hideColor"
      :model-value="modelValue.color"
      :label="t('strokeColor')"
      @update:model-value="update({ color: $event })"
    />
    <BigSlider
      :model-value="modelValue.strokeWidth"
      :label="t('strokeWidth')"
      :min="1"
      :max="120"
      :step="1"
      :default-value="8"
      @update:model-value="update({ strokeWidth: $event })"
    />
    <BigSlider
      :model-value="modelValue.smoothing"
      :label="t('smoothing')"
      :min="0"
      :max="100"
      :step="1"
      :default-value="65"
      @update:model-value="update({ smoothing: $event })"
    />
  </div>
</template>
<style scoped>
.drawing-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
