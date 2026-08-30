<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import Button from '~/ui/button/Button.vue';
import { AudioLines, RotateCcw } from '@lucide/vue';
import type { AudioNormalization } from '~/media/shared/audio-normalization-types';

const { t } = useTranslate('AudioClipPropertiesPanel');

const props = defineProps<{
  clip: { name?: string; enabled?: boolean; volume?: number; normalization?: AudioNormalization } | null;
  normalizationStatus?: 'analyzing' | 'ready' | 'silent' | 'error';
  normalizationError?: string;
}>();

const emit = defineEmits<{
  (e: 'update:volume', value: number): void;
  (e: 'normalize'): void;
  (e: 'reset-normalization'): void;
}>();

const volume = computed(() => props.clip?.volume ?? 100);
</script>

<template>
  <div class="audio-clip-properties">
    <div v-if="!clip" class="empty-state">
      <p class="empty-title">{{ t('noAudioClipSelected') }}</p>
      <p class="empty-desc">{{ t('selectAudioClip') }}</p>
    </div>
    <div v-else class="options-group">
      <div class="section-block">
        <BigSlider
          :model-value="volume"
          :default-value="100"
          :min="0"
          :max="200"
          :step="1"
          :label="t('volume')"
          :format-value="(value) => `${Math.round(value)}%`"
          @update:model-value="emit('update:volume', $event)"
        />
      </div>
      <div class="section-block normalization-block">
        <div class="normalization-heading">
          <div>
            <strong>{{ t('normalize') }}</strong>
            <p>{{ t('normalizeDescription') }}</p>
          </div>
          <Button
            v-if="clip.normalization?.enabled"
            variant="ghost"
            size="sm"
            :icon="RotateCcw"
            :tooltip="t('resetNormalization')"
            icon-only
            @click="emit('reset-normalization')"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          :icon="AudioLines"
          :loading="normalizationStatus === 'analyzing'"
          :disabled="normalizationStatus === 'analyzing'"
          @click="emit('normalize')"
        >
          {{ normalizationStatus === 'analyzing' ? t('analyzing') : t('normalizeButton') }}
        </Button>
        <p v-if="normalizationStatus === 'silent'" class="normalization-status">{{ t('silentAudio') }}</p>
        <p v-else-if="normalizationStatus === 'ready'" class="normalization-status">
          {{ t('normalizedGain', { gain: clip.normalization?.appliedGainDb.toFixed(1) ?? '0.0' }) }}
        </p>
        <p v-else-if="normalizationError" class="normalization-error" role="alert">{{ normalizationError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-clip-properties {
  display: flex;
  flex: 1;
  flex-direction: column;
}
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.normalization-block {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
}
.normalization-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.normalization-heading p,
.normalization-status,
.normalization-error {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}
.normalization-error {
  color: var(--color-error);
}
.empty-desc {
  color: var(--text-secondary);
  font-size: 12px;
}
.empty-title {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-weight: 700;
}
.empty-desc {
  margin: 0;
}
</style>
