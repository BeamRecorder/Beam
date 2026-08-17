<script setup lang="ts">
import { computed } from 'vue';
import { Gauge, Info } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { PreviewQuality } from '~/media/playback';

const props = defineProps<{ modelValue: PreviewQuality }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: PreviewQuality): void }>();
const { t } = useTranslate('TimelineToolbar');

const options = computed(() => [
  { id: 'auto' as const, label: t('previewQualityAuto'), indicator: 'A' },
  { id: 'full' as const, label: t('previewQualityFull'), indicator: '1x' },
  { id: 'half' as const, label: t('previewQualityHalf'), indicator: '1/2' },
  { id: 'quarter' as const, label: t('previewQualityQuarter'), indicator: '1/4' },
]);
const activeOption = computed(() => options.value.find((option) => option.id === props.modelValue)!);
</script>

<template>
  <Popover align="right" direction="up" :match-trigger-width="false">
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        class="preview-quality-trigger"
        :tooltip="`${t('previewQuality')}: ${activeOption.indicator}`"
        :tooltip-disabled="isOpen"
        :aria-label="`${t('previewQuality')}: ${activeOption.label}`"
      >
        <template #icon>
          <span class="preview-quality-icon" aria-hidden="true">
            <Gauge />
            <span class="preview-quality-indicator">{{ activeOption.indicator }}</span>
          </span>
        </template>
      </Button>
    </template>
    <template #default>
      <div class="preview-quality-popover" role="radiogroup" :aria-label="t('previewQuality')">
        <div class="preview-quality-heading">
          <span>{{ t('previewQuality') }}</span>
          <Button
            variant="ghost"
            size="xs"
            icon-only
            :icon="Info"
            :tooltip="t('previewQualityExportHint')"
            tooltip-position="left"
            :aria-label="t('previewQualityExportHint')"
          />
        </div>
        <div class="preview-quality-options">
          <button
            v-for="option in options"
            :key="option.id"
            type="button"
            class="preview-quality-option"
            :class="{ active: modelValue === option.id }"
            role="radio"
            :aria-label="option.label"
            :aria-checked="modelValue === option.id"
            @click="emit('update:modelValue', option.id)"
          >
            {{ option.indicator }}
          </button>
        </div>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.preview-quality-trigger {
  flex: 0 0 auto;
}
.preview-quality-icon {
  position: relative;
  display: inline-flex;
}
.preview-quality-icon > svg {
  width: 17px;
  height: 17px;
}
.preview-quality-indicator {
  position: absolute;
  right: -11px;
  bottom: -6px;
  min-width: 18px;
  padding: 0 3px;
  border-radius: 5px;
  background: var(--color-bg-element);
  color: var(--text-secondary);
  font: 750 10px/13px var(--font-sans);
  text-align: center;
}
.preview-quality-popover {
  width: 172px;
  padding: 6px;
}
.preview-quality-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 4px 7px 7px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}
.preview-quality-heading > span {
  max-width: 112px;
}
.preview-quality-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
}
.preview-quality-option {
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: 700 13px var(--font-sans);
  cursor: pointer;
}
.preview-quality-option:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}
.preview-quality-option.active {
  background: var(--color-primary-light);
  border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
  color: var(--color-primary);
}
</style>
