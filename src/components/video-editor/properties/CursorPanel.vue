<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BigSlider from '~/ui/slider/BigSlider.vue'
import Switch from '~/ui/switch/Switch.vue'
import Select from '~/ui/select/Select.vue'
import ColorPicker from '~/ui/ColorPicker/ColorPicker.vue'
import { cursorOptions, type CursorType } from '../composables/useCursorReplacer'

const props = defineProps<{
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

const colorOptions = [
  { value: '#000000', label: 'Classic Black', color: '#000000' },
  { value: '#ff5a1f', label: 'Brand Orange', color: '#ff5a1f' },
  { value: '#10b981', label: 'Emerald Green', color: '#10b981' },
  { value: '#ef4444', label: 'Warning Red', color: '#ef4444' },
  { value: 'custom', label: 'Custom Color...', color: 'transparent' },
]

const presetColors = ['#000000', '#ff5a1f', '#10b981', '#ef4444']
const isCustomActive = ref(false)

watch(
  () => props.cursorColor,
  (newVal) => {
    if (presetColors.includes(newVal)) {
      isCustomActive.value = false
    } else {
      isCustomActive.value = true
    }
  },
  { immediate: true }
)

const displayedColorValue = computed(() => {
  if (isCustomActive.value) {
    return 'custom'
  }
  return props.cursorColor
})

const handleColorSelect = (value: string) => {
  if (value === 'custom') {
    isCustomActive.value = true
    if (presetColors.includes(props.cursorColor)) {
      emit('update:cursorColor', '#ff5a1e') // Use custom color close to brand orange
    }
  } else {
    isCustomActive.value = false
    emit('update:cursorColor', value)
  }
}
</script>

<template>
  <div class="options-group">
    <div class="prop-item">
      <label class="prop-label">Cursor Style</label>
      <Select 
        :model-value="selectedCursor" 
        :options="cursorOptions" 
        :preview-on-hover="true"
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
        :model-value="displayedColorValue" 
        :options="colorOptions" 
        :preview-on-hover="true"
        @update:modelValue="handleColorSelect"
      />
    </div>

    <div v-if="displayedColorValue === 'custom'" class="prop-item custom-picker-wrapper">
      <ColorPicker 
        :model-value="cursorColor"
        :show-label="false"
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

.custom-picker-wrapper {
  margin-top: -8px;
  padding-left: 4px;
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

