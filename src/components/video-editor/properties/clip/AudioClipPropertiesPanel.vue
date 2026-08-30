<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import Switch from '~/ui/switch/Switch.vue';
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
const normalizationEnabled = computed(
  () => props.normalizationStatus === 'analyzing' || props.clip?.normalization?.enabled === true,
);
const updateNormalization = (enabled: boolean) => {
  if (enabled) emit('normalize');
  else emit('reset-normalization');
};
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
      <div class="normalization-control">
        <div class="normalization-label">
          <span>{{ t('normalize') }}</span>
          <span v-if="normalizationStatus === 'analyzing'" class="normalization-status">{{ t('analyzing') }}</span>
          <span v-else-if="normalizationStatus === 'ready'" class="normalization-status">
            {{ t('normalizedGain', { gain: clip.normalization?.appliedGainDb.toFixed(1) ?? '0.0' }) }}
          </span>
        </div>
        <Switch
          :model-value="normalizationEnabled"
          :disabled="normalizationStatus === 'analyzing'"
          :aria-label="t('normalize')"
          @update:model-value="updateNormalization"
        />
      </div>
      <p v-if="normalizationStatus === 'silent'" class="normalization-message">{{ t('silentAudio') }}</p>
      <p v-else-if="normalizationError" class="normalization-error" role="alert">{{ normalizationError }}</p>
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
.normalization-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.normalization-label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}
.normalization-status {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 500;
}
.normalization-message,
.normalization-error {
  margin: -6px 0 0;
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
