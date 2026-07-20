<script setup lang="ts">

import Slider from '~/ui/slider/Slider.vue'
import Switch from '~/ui/switch/Switch.vue'
import Select from '~/ui/select/Select.vue'
import type { CursorType } from '../composables/useCursorReplacer'

const props = defineProps<{
  activeTab: string
  
  // Cursor properties
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean

  // Audio properties
  volume: number
  isVideoEnabled: boolean
  isSystemAudioEnabled: boolean
  isMicAudioEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedCursor', value: CursorType): void
  (e: 'update:cursorSize', value: number): void
  (e: 'update:cursorColor', value: string): void
  (e: 'update:enableShadow', value: boolean): void
  (e: 'update:enableRipple', value: boolean): void
  (e: 'update:volume', value: number): void
  (e: 'update:isVideoEnabled', value: boolean): void
  (e: 'update:isSystemAudioEnabled', value: boolean): void
  (e: 'update:isMicAudioEnabled', value: boolean): void
}>()

const cursorOptions = [
  { value: 'pointer', label: 'macOS Pointer (Default)' },
  { value: 'link', label: 'macOS Link Hand' },
  { value: 'text', label: 'macOS Text I-Beam' },
  { value: 'grabbing', label: 'macOS Grabbing Hand' },
  { value: 'busy', label: 'macOS Busy Loader' },
]

const colorOptions = [
  { value: '#000000', label: 'Classic Black' },
  { value: '#ff5a1f', label: 'Brand Orange' },
  { value: '#2563eb', label: 'Electric Blue' },
  { value: '#10b981', label: 'Emerald Green' },
  { value: '#ef4444', label: 'Warning Red' },
]
</script>

<template>
  <div class="properties-island">
    <div class="panel-header">
      <h3 class="panel-title">Properties</h3>
      <span class="panel-subtitle">{{ activeTab.toUpperCase() }} OPTIONS</span>
    </div>

    <div class="panel-content">
      <!-- Cursor Options Panel -->
      <div v-if="activeTab === 'cursor'" class="options-group">
        <div class="prop-item">
          <label class="prop-label">Cursor Style</label>
          <Select 
            :model-value="selectedCursor" 
            :options="cursorOptions" 
            @update:modelValue="emit('update:selectedCursor', $event)"
          />
        </div>

        <div class="prop-item">
          <label class="prop-label">Cursor Size: {{ cursorSize }}px</label>
          <Slider 
            :model-value="cursorSize" 
            :min="16" 
            :max="64" 
            @update:modelValue="emit('update:cursorSize', $event)"
          />
        </div>

        <div class="prop-item">
          <label class="prop-label">Cursor Color</label>
          <Select 
            :model-value="cursorColor" 
            :options="colorOptions" 
            @update:modelValue="emit('update:cursorColor', $event)"
          />
        </div>

        <div class="prop-row">
          <span class="prop-label">Drop Shadow</span>
          <Switch 
            :model-value="enableShadow" 
            @update:modelValue="emit('update:enableShadow', $event)"
          />
        </div>

        <div class="prop-row">
          <span class="prop-label">Click Ripple Effect</span>
          <Switch 
            :model-value="enableRipple" 
            @update:modelValue="emit('update:enableRipple', $event)"
          />
        </div>
      </div>

      <!-- Trim Options Panel -->
      <div v-else-if="activeTab === 'trim'" class="options-group">
        <p class="info-text">Select range on the timeline at the bottom to cut, trim or crop your video clip.</p>
        <div class="prop-row">
          <span class="prop-label">Enable Trim Mode</span>
          <Switch :model-value="true" disabled />
        </div>
      </div>

      <!-- Audio Options Panel -->
      <div v-else-if="activeTab === 'audio'" class="options-group">
        <div class="prop-item">
          <label class="prop-label">Global Volume: {{ volume }}%</label>
          <Slider 
            :model-value="volume" 
            :min="0" 
            :max="100" 
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

      <!-- Effects Panel -->
      <div v-else class="options-group">
        <p class="info-text">Hover animations, zooming zoom-in effects, and border glow styling options.</p>
        <div class="prop-row">
          <span class="prop-label">Zoom on Cursor Click</span>
          <Switch :model-value="false" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.properties-island {
  width: 260px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header {
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 12px;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.panel-subtitle {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

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

.info-text {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
