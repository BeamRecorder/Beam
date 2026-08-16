<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import DeleteItem from '~/ui/button/DeleteItem.vue';
import { useTranslate } from '~/i18n/useTranslate';

const { t } = useTranslate('AudioClipPropertiesPanel');

const props = defineProps<{
  clip: { name?: string; enabled?: boolean; volume?: number } | null;
}>();

const emit = defineEmits<{
  (e: 'update:volume', value: number): void;
  (e: 'delete'): void;
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
        <span class="section-title">{{ clip.name || t('audioControls') }}</span>
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
      <div class="danger-zone">
        <DeleteItem :label="t('deleteAudioClip')" @click="emit('delete')" />
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
.section-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
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
.danger-zone {
  margin-top: auto;
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  background: var(--color-bg-element);
  z-index: 10;
  width: 100%;
}

.danger-zone :deep(.btn-container),
.danger-zone :deep(.delete-item-btn) {
  width: 100%;
}
</style>
