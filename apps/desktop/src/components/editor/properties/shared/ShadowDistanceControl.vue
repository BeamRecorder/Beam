<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ modelValue: number; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const { t } = useTranslate('ClipPropertiesPanel');
</script>
<template>
  <div :inert="disabled || undefined" :aria-disabled="disabled || undefined" class="shadow-distance">
    <BigSlider
      :model-value="modelValue"
      :min="0"
      :max="256"
      :step="1"
      :default-value="0"
      :label="t('shadowDistance')"
      :format-value="(value) => `${Math.round(value)}px`"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
<style scoped>
.shadow-distance[aria-disabled='true'] {
  opacity: 0.5;
}
</style>
