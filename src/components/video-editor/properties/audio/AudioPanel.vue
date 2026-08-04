<script setup lang="ts">
import { ref } from 'vue'
import BigSlider from '~/ui/slider/BigSlider.vue'
import Switch from '~/ui/switch/Switch.vue'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('AudioPanel')

const props = withDefaults(
  defineProps<{
    volume: number
    isSystemAudioEnabled: boolean
    isMicAudioEnabled: boolean
    systemVolume?: number
    micVolume?: number
  }>(),
  {
    systemVolume: 100,
    micVolume: 100,
  },
)

const emit = defineEmits<{
  (e: 'update:volume', value: number): void
  (e: 'update:isSystemAudioEnabled', value: boolean): void
  (e: 'update:isMicAudioEnabled', value: boolean): void
  (e: 'update:systemVolume', value: number): void
  (e: 'update:micVolume', value: number): void
}>()

const localSystemVolume = ref(props.systemVolume)
const localMicVolume = ref(props.micVolume)

const handleSystemVolChange = (val: number) => {
  localSystemVolume.value = val
  emit('update:systemVolume', val)
}

const handleMicVolChange = (val: number) => {
  localMicVolume.value = val
  emit('update:micVolume', val)
}
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

    <div class="audio-section">
      <div class="prop-row">
        <span class="prop-label">{{ t('systemSoundTrack') }}</span>
        <Switch :model-value="isSystemAudioEnabled" @update:modelValue="emit('update:isSystemAudioEnabled', $event)" />
      </div>
      <div v-if="isSystemAudioEnabled" class="prop-item sub-slider">
        <BigSlider
          :model-value="localSystemVolume"
          :default-value="100"
          :min="0"
          :max="100"
          :label="t('systemVolume')"
          :format-value="(val) => `${val}%`"
          @update:modelValue="handleSystemVolChange"
        />
      </div>
    </div>

    <div class="audio-section">
      <div class="prop-row">
        <span class="prop-label">{{ t('microphoneTrack') }}</span>
        <Switch :model-value="isMicAudioEnabled" @update:modelValue="emit('update:isMicAudioEnabled', $event)" />
      </div>
      <div v-if="isMicAudioEnabled" class="prop-item sub-slider">
        <BigSlider
          :model-value="localMicVolume"
          :default-value="100"
          :min="0"
          :max="100"
          :label="t('microphoneVolume')"
          :format-value="(val) => `${val}%`"
          @update:modelValue="handleMicVolChange"
        />
      </div>
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
</style>
