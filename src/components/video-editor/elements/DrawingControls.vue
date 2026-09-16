<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import { computed } from 'vue';
import type { DrawingSettings } from '~/media/shared/element-types';
import type { ColorFill } from '~/media/shared/color-fill-types';
import { useTranslate } from '~/i18n/useTranslate';
import ColorFillPresetControls from '../properties/ColorFillPresetControls.vue';
const props = defineProps<{ modelValue: DrawingSettings; hideColor?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: DrawingSettings] }>();
const { t } = useTranslate('Elements');
const update = (patch: Partial<DrawingSettings>) => emit('update:modelValue', { ...props.modelValue, ...patch });
const fill = computed<ColorFill>(() => props.modelValue.fill ?? { kind: 'color', color: props.modelValue.color });
const updateFill = (value: ColorFill) =>
  update({
    fill: value,
    ...(value.kind === 'color' ? { color: value.color } : {}),
  });
</script>
<template>
  <div class="drawing-controls">
    <ColorFillPresetControls
      v-if="!hideColor"
      :model-value="fill"
      :label="t('strokeColor')"
      @update:model-value="updateFill"
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
