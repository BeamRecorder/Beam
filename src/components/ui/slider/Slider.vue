<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    disabled?: boolean
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const percentage = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return ((props.modelValue - props.min) / range) * 100
})

const handleInput = (event: Event) => {
  if (props.disabled) return
  const val = Number((event.target as HTMLInputElement).value)
  emit('update:modelValue', val)
}
</script>

<template>
  <div class="slider-wrapper" :class="{ 'is-disabled': disabled }">
    <div class="slider-track-container">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        class="slider-input"
        :style="{
          background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${percentage}%, var(--color-border) ${percentage}%, var(--color-border) 100%)`,
        }"
        @input="handleInput"
      />
    </div>
    <span class="slider-value">{{ modelValue }}</span>
  </div>
</template>

<style scoped>
.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.slider-wrapper.is-disabled {
  opacity: 0.6;
}

.slider-track-container {
  position: relative;
  flex-grow: 1;
  display: flex;
  align-items: center;
}

.slider-input {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 12px; /* Fat track! */
  border-radius: var(--radius-full);
  outline: none;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.slider-input:disabled {
  cursor: not-allowed;
}

/* Webkit Thumb */
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px; /* Large thumb */
  height: 24px;
  border-radius: 50%;
  background: white;
  border: 4px solid var(--color-primary);
  box-shadow: var(--shadow-md);
  transition:
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s ease;
}

.slider-input:hover:not(:disabled)::-webkit-slider-thumb {
  transform: scale(1.2);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary-hover);
}

.slider-input:active:not(:disabled)::-webkit-slider-thumb {
  transform: scale(0.95);
}

/* Firefox Thumb */
.slider-input::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
  border: 4px solid var(--color-primary);
  box-shadow: var(--shadow-md);
  transition:
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s ease;
  cursor: pointer;
}

.slider-input:hover:not(:disabled)::-moz-range-thumb {
  transform: scale(1.2);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary-hover);
}

.slider-input:active:not(:disabled)::-moz-range-thumb {
  transform: scale(0.95);
}

.slider-value {
  font-family: var(--font-sans);
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-primary);
  min-width: 2.5rem;
  text-align: right;
}
</style>
