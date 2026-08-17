<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Gauge, Info } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { PreviewQuality } from '~/media/playback';
import BlurRevealTransition from '~/ui/transitions/BlurRevealTransition.vue';
import type { PreviewPerformanceSnapshot } from '../performance/preview-performance-types';

const props = defineProps<{ modelValue: PreviewQuality; performanceSnapshot?: PreviewPerformanceSnapshot | null }>();
const emit = defineEmits<{ (event: 'update:modelValue', value: PreviewQuality): void }>();
const { t } = useTranslate('TimelineToolbar');

const options = computed(() => [
  { id: 'auto' as const, label: t('previewQualityAuto'), indicator: 'A' },
  { id: 'full' as const, label: t('previewQualityFull'), indicator: '1x' },
  { id: 'half' as const, label: t('previewQualityHalf'), indicator: '1/2' },
  { id: 'quarter' as const, label: t('previewQualityQuarter'), indicator: '1/4' },
]);
const activeOption = computed(() => options.value.find((option) => option.id === props.modelValue)!);
const warningLevel = computed<'warning' | 'critical' | null>(() => {
  const status = props.performanceSnapshot?.status;
  return status === 'warning' || status === 'critical' ? status : null;
});
const showSuggestion = ref(false);
let suggestionShown = false;
let suggestionTimer: ReturnType<typeof setTimeout> | null = null;

const hideSuggestion = () => {
  showSuggestion.value = false;
  if (suggestionTimer) clearTimeout(suggestionTimer);
  suggestionTimer = null;
};
const selectRecommendation = () => {
  const quality = props.performanceSnapshot?.recommendation;
  if (quality) emit('update:modelValue', quality);
  hideSuggestion();
};

watch(
  warningLevel,
  (level) => {
    if (!level || suggestionShown || !props.performanceSnapshot?.recommendation) return;
    suggestionShown = true;
    showSuggestion.value = true;
    suggestionTimer = setTimeout(hideSuggestion, 3_000);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (suggestionTimer) clearTimeout(suggestionTimer);
});
</script>

<template>
  <div class="preview-quality-control">
    <BlurRevealTransition>
      <div v-if="showSuggestion" class="preview-quality-suggestion" role="status" aria-live="polite">
        <span>{{
          t(warningLevel === 'critical' ? 'previewQualityCriticalSuggestion' : 'previewQualitySuggestion')
        }}</span>
        <button v-if="performanceSnapshot?.recommendation" type="button" @click.stop="selectRecommendation">
          {{ performanceSnapshot.recommendation === 'half' ? '1/2' : '1/4' }}
        </button>
      </div>
    </BlurRevealTransition>
    <Popover align="right" direction="up" :match-trigger-width="false" @toggle="$event && hideSuggestion()">
      <template #trigger="{ isOpen }">
        <Button
          variant="ghost"
          size="sm"
          icon-only
          class="preview-quality-trigger"
          :class="warningLevel ? `is-${warningLevel}` : undefined"
          :tooltip="`${t('previewQuality')}: ${activeOption.indicator}`"
          :tooltip-disabled="isOpen"
          :aria-label="`${t('previewQuality')}: ${activeOption.label}`"
        >
          <template #icon>
            <span
              class="preview-quality-icon"
              :class="warningLevel ? `is-${warningLevel}` : undefined"
              aria-hidden="true"
            >
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
  </div>
</template>

<style scoped>
.preview-quality-control {
  position: relative;
  display: inline-flex;
}
.preview-quality-trigger {
  flex: 0 0 auto;
  transition: color 0.3s ease, border-color 0.3s ease, background-color 0.3s ease;
}
.preview-quality-trigger.is-warning {
  color: var(--color-warning) !important;
  border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
}
.preview-quality-trigger.is-critical {
  color: var(--color-error) !important;
  border-color: color-mix(in srgb, var(--color-error) 48%, var(--color-border));
}
.preview-quality-icon {
  position: relative;
  display: inline-flex;
  transition: color 0.3s ease;
}
.preview-quality-icon > svg {
  width: 17px;
  height: 17px;
}
.preview-quality-icon.is-warning {
  color: var(--color-warning);
}
.preview-quality-icon.is-critical {
  color: var(--color-error);
}
.preview-quality-indicator {
  position: absolute;
  right: -11px;
  bottom: -6px;
  min-width: 18px;
  padding: 0 3px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: var(--color-bg-element);
  color: var(--text-secondary);
  font: 750 10px/13px var(--font-sans);
  text-align: center;
  transition: color 0.3s ease, border-color 0.3s ease, background-color 0.3s ease;
}
.preview-quality-icon.is-warning .preview-quality-indicator {
  color: var(--color-warning);
  border-color: color-mix(in srgb, var(--color-warning) 45%, transparent);
}
.preview-quality-icon.is-critical .preview-quality-indicator {
  color: var(--color-error);
  border-color: color-mix(in srgb, var(--color-error) 48%, transparent);
}
.preview-quality-suggestion {
  --blur-reveal-max-height: 56px;
  position: absolute;
  right: 0;
  bottom: 35px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 7px;
  width: max-content;
  max-width: 280px;
  padding: 6px 7px 6px 9px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 42%, var(--color-border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-element) 94%, transparent);
  box-shadow: var(--shadow-md);
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.preview-quality-suggestion button {
  height: 22px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 48%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
  color: var(--color-warning);
  font: 750 10px var(--font-sans);
  cursor: pointer;
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
