<script setup lang="ts">
import { Blend } from '@lucide/vue';
import Input from '~/ui/input/Input.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ScreenshotOpacityProps } from './screenshot-layer-controls-types';
const props = defineProps<ScreenshotOpacityProps>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();
const { t } = useTranslate('ScreenshotComposition');
const update = (raw: string | number) => {
  const value = Number(raw);
  if (!props.disabled && String(raw).trim() && Number.isFinite(value))
    emit('update:modelValue', Math.max(0, Math.min(100, value)));
};
</script>
<template>
  <Input
    :model-value="modelValue"
    type="number"
    size="sm"
    appearance="neutral"
    width="104px"
    height="2.125rem"
    commit-on-blur
    :min="0"
    :max="100"
    :step="1"
    unit="%"
    :aria-label="t('opacity')"
    :title="t('opacity')"
    :disabled="disabled"
    @update:model-value="update"
  >
    <template #prefix><Blend :size="14" aria-hidden="true" /></template>
  </Input>
</template>
