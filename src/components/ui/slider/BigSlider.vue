<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    formatValue?: (val: number) => string;
  }>(),
  { min: 0, max: 1, step: 0.01 },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
  "interaction-start": [];
  "interaction-end": [];
}>();

const percentage = computed(() => {
  const range = props.max - props.min;
  if (range === 0) return 0;
  return ((props.modelValue - props.min) / range) * 100;
});

const displayValue = computed(() => {
  if (props.formatValue) return props.formatValue(props.modelValue);
  return props.modelValue.toString();
});
</script>

<template>
  <div
    class="big-slider-container"
    :style="{
      background: `linear-gradient(to right, color-mix(in srgb, var(--accent) 20%, var(--surface)) ${percentage}%, var(--surface) ${percentage}%)`,
    }"
  >
    <div class="big-slider-overlay">
      <span class="big-slider-label">{{ label }}</span>
      <span class="big-slider-value">{{ displayValue }}</span>
    </div>
    <input
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      class="big-slider-input"
      @input="
        emit(
          'update:modelValue',
          parseFloat(($event.target as HTMLInputElement).value),
        )
      "
      @pointerdown="emit('interaction-start')"
      @change="emit('interaction-end')"
    />
  </div>
</template>

<style scoped>
.big-slider-container {
  position: relative;
  width: 100%;
  height: 38px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  align-items: center;
  transition:
    border-color var(--fast),
    background var(--fast);
}
.big-slider-container:hover {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
}
.big-slider-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  pointer-events: none;
  z-index: 1;
}
.big-slider-label {
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.big-slider-value {
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  font-family: monospace;
}
.big-slider-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 100%;
  background: transparent;
  outline: none;
  cursor: pointer;
  margin: 0;
  position: relative;
  z-index: 2;
}

/* Chrome/Safari */
.big-slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 2px;
  height: 38px;
  background: #ffffff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
  cursor: ew-resize;
  border: none;
}

/* Firefox */
.big-slider-input::-moz-range-thumb {
  width: 2px;
  height: 38px;
  background: #ffffff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
  cursor: ew-resize;
  border: none;
  border-radius: 0;
}
</style>
