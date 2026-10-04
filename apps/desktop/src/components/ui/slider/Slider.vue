<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    valueSuffix?: string;
    size?: 'default' | 'compact';
    showValue?: boolean;
    label?: string;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    valueSuffix: '',
    size: 'default',
    showValue: true,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'commit', value: number): void;
}>();

const percentage = computed(() => {
  const range = props.max - props.min;
  if (range <= 0) return 0;
  return ((props.modelValue - props.min) / range) * 100;
});

const handleInput = (event: Event) => {
  if (props.disabled) return;
  const val = Number((event.target as HTMLInputElement).value);
  emit('update:modelValue', val);
};

const handleCommit = (event: Event) => {
  if (props.disabled) return;
  emit('commit', Number((event.target as HTMLInputElement).value));
};
</script>

<template>
  <div class="slider-wrapper" :class="[`size-${size}`, { 'is-disabled': disabled }]">
    <div class="slider-track-container">
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label"
        class="slider-input"
        :style="{
          background: `linear-gradient(to right, var(--text-secondary) 0%, var(--text-secondary) ${percentage}%, var(--color-border) ${percentage}%, var(--color-border) 100%)`,
        }"
        @input="handleInput"
        @change="handleCommit"
      />
    </div>
    <span v-if="showValue" class="slider-value">{{ modelValue }}{{ valueSuffix }}</span>
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
  height: 8px;
  border-radius: var(--radius-full);
  outline: none;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.slider-input:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 4px;
}

.slider-input:disabled {
  cursor: not-allowed;
}

/* Webkit Thumb */
.slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-bg-element);
  border: 2px solid var(--text-secondary);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s ease;
}

.slider-input:hover:not(:disabled)::-webkit-slider-thumb {
  transform: scale(1.08);
  border-color: var(--text-primary);
}

.slider-input:active:not(:disabled)::-webkit-slider-thumb {
  transform: scale(0.95);
}

/* Firefox Thumb */
.slider-input::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-bg-element);
  border: 2px solid var(--text-secondary);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s ease;
  cursor: pointer;
}

.slider-input:hover:not(:disabled)::-moz-range-thumb {
  transform: scale(1.08);
  border-color: var(--text-primary);
}

.slider-input:active:not(:disabled)::-moz-range-thumb {
  transform: scale(0.95);
}

.slider-value {
  font-family: var(--font-sans);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  color: var(--text-primary);
  min-width: 2.5rem;
  text-align: right;
}

.size-compact {
  gap: 10px;
}

.size-compact .slider-input {
  height: 6px;
}

.size-compact .slider-input::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.size-compact .slider-input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.size-compact .slider-value {
  min-width: 2.2rem;
  font-size: 0.8rem;
}
</style>
