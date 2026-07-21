<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue'
import Switch from '~/ui/switch/Switch.vue'

defineProps<{
  volume: number
  isSystemAudioEnabled: boolean
  isMicAudioEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'update:volume', value: number): void
  (e: 'update:isSystemAudioEnabled', value: boolean): void
  (e: 'update:isMicAudioEnabled', value: boolean): void
}>()
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <BigSlider 
        :model-value="volume" 
        :default-value="100"
        :min="0" 
        :max="100"
        label="Global Volume"
        :format-value="(val) => `${val}%`"
        @update:modelValue="emit('update:volume', $event)"
      />
    </div>

    <div class="prop-row">
      <span class="prop-label">System Sound Track</span>
      <Switch 
        :model-value="isSystemAudioEnabled" 
        @update:modelValue="emit('update:isSystemAudioEnabled', $event)"
      />
    </div>

    <div class="prop-row">
      <span class="prop-label">Microphone Track</span>
      <Switch 
        :model-value="isMicAudioEnabled" 
        @update:modelValue="emit('update:isMicAudioEnabled', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.options-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prop-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.prop-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
</style>
