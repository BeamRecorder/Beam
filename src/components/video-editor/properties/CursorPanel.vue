<script setup lang="ts">
import BigSlider from '~/ui/slider/BigSlider.vue'
import Switch from '~/ui/switch/Switch.vue'
import Select from '~/ui/select/Select.vue'
import type { CursorType } from '../composables/useCursorReplacer'

defineProps<{
  selectedCursor: CursorType
  cursorSize: number
  cursorColor: string
  enableShadow: boolean
  enableRipple: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedCursor', value: CursorType): void
  (e: 'update:cursorSize', value: number): void
  (e: 'update:cursorColor', value: string): void
  (e: 'update:enableShadow', value: boolean): void
  (e: 'update:enableRipple', value: boolean): void
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
  { value: '#ff5a1f', label: 'Demo Orange' },
  { value: '#10b981', label: 'Emerald Green' },
  { value: '#ef4444', label: 'Warning Red' },
]
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <label class="prop-label">Cursor Style</label>
      <Select 
        :model-value="selectedCursor" 
        :options="cursorOptions" 
        @update:modelValue="emit('update:selectedCursor', $event)"
      />
    </div>

    <div class="prop-item">
      <BigSlider 
        :model-value="cursorSize" 
        :min="16" 
        :max="64"
        label="Cursor Size"
        :format-value="(val) => `${val}px`"
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
