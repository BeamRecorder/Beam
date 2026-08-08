<script setup lang="ts">
import { computed } from 'vue';
import type { CapturePreview, CaptureSource } from '../../api/types/capture-api';
import Select from '~/ui/select/Select.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { matchScreenPreview } from './source-preview';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    kind: 'screen' | 'window';
    sources?: CaptureSource[];
    previews?: CapturePreview[];
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    sources: () => [],
    previews: () => [],
    loading: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'toggle', open: boolean): void;
}>();

const { t } = useTranslate('HUD');
const displaySources = computed(() => props.sources.filter((source) => source.kind === 'display'));
const options = computed(() => {
  if (props.kind === 'window') {
    return props.previews.map((preview) => ({
      value: preview.id,
      label: preview.name,
      thumbnail: preview.thumbnail || undefined,
      appIcon: preview.appIcon,
    }));
  }

  return displaySources.value.map((source, index) => {
    const preview = matchScreenPreview(source, displaySources.value, props.previews);
    return {
      value: source.id,
      label: t('screenOption', { index: index + 1 }),
      thumbnail: preview?.thumbnail || undefined,
      loading: props.loading && !preview?.thumbnail,
    };
  });
});

const emptyLabel = computed(() =>
  props.kind === 'screen' ? t('noScreensDetected') : t('noWindowsDetected'),
);
const placeholder = computed(() => {
  if (!props.loading && options.value.length === 0) return emptyLabel.value;
  return props.kind === 'screen' ? t('selectScreen') : t('selectWindow');
});
const selectSource = (value: string | number) => emit('update:modelValue', String(value));
</script>

<template>
  <Select
    :model-value="modelValue"
    :options="options"
    :placeholder="placeholder"
    :empty-label="emptyLabel"
    :loading="loading"
    :disabled="disabled"
    variant="source"
    @update:model-value="selectSource"
    @toggle="emit('toggle', $event)"
  />
</template>
