<script setup lang="ts">
import { computed } from 'vue';
import { Check, Gauge } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { PreviewQuality } from '~/media/playback';

const props = defineProps<{ modelValue: PreviewQuality }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: PreviewQuality): void }>();
const { t } = useTranslate('TimelineToolbar');

const options = computed(() => [
  { id: 'auto' as const, label: t('previewQualityAuto'), indicator: 'A' },
  { id: 'full' as const, label: t('previewQualityFull'), indicator: '1×' },
  { id: 'half' as const, label: t('previewQualityHalf'), indicator: '½' },
  { id: 'quarter' as const, label: t('previewQualityQuarter'), indicator: '¼' },
]);
const activeOption = computed(() => options.value.find((option) => option.id === props.modelValue)!);
</script>

<template>
  <Popover align="right" direction="up" :match-trigger-width="false">
    <template #trigger>
      <Button
        variant="ghost"
        size="sm"
        icon-only
        class="preview-quality-trigger"
        :tooltip="`${t('previewQuality')}: ${activeOption.label}`"
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
    <template #default="{ close }">
      <div class="preview-quality-popover" role="radiogroup" :aria-label="t('previewQuality')">
        <div class="preview-quality-heading">
          <span>{{ t('previewQuality') }}</span>
          <small>{{ t('previewQualityExportHint') }}</small>
        </div>
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          class="preview-quality-option"
          :class="{ active: modelValue === option.id }"
          role="radio"
          :aria-checked="modelValue === option.id"
          @click="
            emit('update:modelValue', option.id);
            close();
          "
        >
          <span>{{ option.label }}</span>
          <Check v-if="modelValue === option.id" aria-hidden="true" />
        </button>
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
  right: -7px;
  bottom: -6px;
  min-width: 13px;
  padding: 0 2px;
  border-radius: 5px;
  background: var(--color-bg-element);
  color: var(--text-secondary);
  font: 700 8px/11px var(--font-sans);
  text-align: center;
}
.preview-quality-popover {
  width: 220px;
  padding: 6px;
}
.preview-quality-heading {
  display: grid;
  gap: 2px;
  padding: 6px 8px 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}
.preview-quality-heading small {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 500;
}
.preview-quality-option {
  width: 100%;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font: 500 12px var(--font-sans);
  cursor: pointer;
}
.preview-quality-option:hover,
.preview-quality-option.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.preview-quality-option svg {
  width: 14px;
  height: 14px;
}
</style>
