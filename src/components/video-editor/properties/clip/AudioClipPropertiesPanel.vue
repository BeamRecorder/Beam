<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('AudioClipPropertiesPanel');

const props = defineProps<{
  clip: { volume?: number } | null;
}>();

const emit = defineEmits<{
  (e: 'update:volume', value: number): void;
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
