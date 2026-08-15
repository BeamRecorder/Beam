<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';

defineProps<{ modelValue: number }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: number): void }>();
const { t } = useTranslate('CaptionClipPanel');
</script>

<template>
  <BigSlider
    :label="t('backdropBlur')"
    :model-value="modelValue"
    :min="0"
    :max="48"
    :step="1"
    :default-value="0"
    :format-value="(value) => `${value}px`"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
