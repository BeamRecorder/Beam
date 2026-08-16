<script setup lang="ts">
import { computed } from 'vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import ClipActionGroup from './ClipActionGroup.vue';

const { t } = useTranslate('AudioClipPropertiesPanel');
const { t: tClip } = useTranslate('ClipPropertiesPanel');

const props = defineProps<{
  clip: { name?: string; enabled?: boolean; volume?: number } | null;
}>();

const emit = defineEmits<{
  (e: 'update:volume', value: number): void;
  (e: 'update:enabled', value: boolean): void;
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
        <div class="section-header">
          <span class="section-title">{{ clip.name || t('audioClip') }}</span>
          <ClipActionGroup
            :enabled="clip.enabled ?? true"
            :enabled-label="tClip('enabled')"
            :disabled-label="tClip('disabled')"
            :delete-label="t('deleteAudioClip')"
            @toggle="emit('update:enabled', !(clip.enabled ?? true))"
            @delete="emit('delete')"
          />
        </div>
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
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 12px;
}
.section-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
