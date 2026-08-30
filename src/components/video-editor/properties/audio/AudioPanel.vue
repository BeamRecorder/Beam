<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import ClipActionGroup from '~/components/video-editor/properties/clip/ClipActionGroup.vue';
import Button from '~/ui/button/Button.vue';
import { AudioLines } from '@lucide/vue';

const { t } = useTranslate('AudioPanel');
const { t: tClip } = useTranslate('ClipPropertiesPanel');

const props = withDefaults(
  defineProps<{
    volume: number;
    isSystemAudioEnabled: boolean;
    isMicAudioEnabled: boolean;
    hasSystemAudio?: boolean;
    hasMicAudio?: boolean;
    hasAudio?: boolean;
    systemVolume?: number;
    micVolume?: number;
  }>(),
  {
    systemVolume: 100,
    micVolume: 100,
    hasSystemAudio: false,
    hasMicAudio: false,
    hasAudio: false,
  },
);

const emit = defineEmits<{
  (e: 'update:volume', value: number): void;
  (e: 'update:isSystemAudioEnabled', value: boolean): void;
  (e: 'update:isMicAudioEnabled', value: boolean): void;
  (e: 'update:systemVolume', value: number): void;
  (e: 'update:micVolume', value: number): void;
  (e: 'delete:system'): void;
  (e: 'delete:microphone'): void;
  (e: 'normalize-all'): void;
}>();

const handleSystemVolChange = (val: number) => {
  emit('update:systemVolume', val);
};

const handleMicVolChange = (val: number) => {
  emit('update:micVolume', val);
};
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <BigSlider
        :model-value="volume"
        :default-value="100"
        :min="0"
        :max="100"
        :label="t('globalVolume')"
        :format-value="(val) => `${val}%`"
        @update:modelValue="emit('update:volume', $event)"
      />
    </div>
    <Button variant="secondary" size="sm" :icon="AudioLines" :disabled="!hasAudio" @click="emit('normalize-all')">
      {{ t('normalizeAll') }}
    </Button>

    <div v-if="hasSystemAudio" class="audio-section">
      <div class="prop-row">
        <span class="prop-label">{{ t('systemSoundTrack') }}</span>
        <ClipActionGroup
          :enabled="isSystemAudioEnabled"
          :enabled-label="tClip('enabled')"
          :disabled-label="tClip('disabled')"
          :delete-label="t('deleteSystemTrack')"
          @toggle="emit('update:isSystemAudioEnabled', !isSystemAudioEnabled)"
          @delete="emit('delete:system')"
        />
      </div>
      <div v-if="isSystemAudioEnabled" class="prop-item sub-slider">
        <BigSlider
          :model-value="systemVolume"
          :default-value="100"
          :min="0"
          :max="100"
          :label="t('systemVolume')"
          :format-value="(val) => `${val}%`"
          @update:modelValue="handleSystemVolChange"
        />
      </div>
    </div>

    <div v-if="hasMicAudio" class="audio-section">
      <div class="prop-row">
        <span class="prop-label">{{ t('microphoneTrack') }}</span>
        <ClipActionGroup
          :enabled="isMicAudioEnabled"
          :enabled-label="tClip('enabled')"
          :disabled-label="tClip('disabled')"
          :delete-label="t('deleteMicrophoneTrack')"
          @toggle="emit('update:isMicAudioEnabled', !isMicAudioEnabled)"
          @delete="emit('delete:microphone')"
        />
      </div>
      <div v-if="isMicAudioEnabled" class="prop-item sub-slider">
        <BigSlider
          :model-value="micVolume"
          :default-value="100"
          :min="0"
          :max="100"
          :label="t('microphoneVolume')"
          :format-value="(val) => `${val}%`"
          @update:modelValue="handleMicVolChange"
        />
      </div>
    </div>

    <div v-if="!hasSystemAudio && !hasMicAudio" class="empty-state" role="status">
      <p>{{ t('noAudioTracksDetected') }}</p>
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.audio-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--color-bg-element);
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-slider {
  margin-top: 4px;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.empty-state {
  padding: 18px 14px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}
.empty-state p {
  margin: 0;
}
</style>
