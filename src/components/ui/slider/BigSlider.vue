<script setup lang="ts">
import { computed, ref, nextTick, onBeforeUnmount } from 'vue';
import { RotateCcw } from '@lucide/vue';
import Input from '../input/Input.vue';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    defaultValue?: number;
    formatValue?: (val: number) => string;
  }>(),
  { min: 0, max: 1, step: 0.01 },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
  (e: 'interaction-start'): void;
  (e: 'interaction-end'): void;
  (e: 'interaction-cancel'): void;
  (e: 'reset'): void;
}>();

const isEditing = ref(false);
const isInteracting = ref(false);
const editValue = ref<number | string>(props.modelValue);
let pendingRangeValue: number | null = null;
let rangeFrame: number | null = null;

const percentage = computed(() => {
  const range = props.max - props.min;
  if (range === 0) return 0;
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / range) * 100));
});

const displayValue = computed(() => {
  if (props.formatValue) return props.formatValue(props.modelValue);
  return props.modelValue.toString();
});

const isChanged = computed(() => {
  if (props.defaultValue === undefined) return false;
  return Math.abs(props.modelValue - props.defaultValue) > 0.0001;
});

const startEditing = () => {
  editValue.value = props.modelValue;
  isEditing.value = true;
  void nextTick(() => {
    const el = document.getElementById(`slider-input-${props.label.replace(/\s+/g, '-')}`);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
  });
};

const finishEditing = () => {
  if (!isEditing.value) return;
  isEditing.value = false;
  let parsed = typeof editValue.value === 'number' ? editValue.value : parseFloat(String(editValue.value));
  if (isNaN(parsed)) parsed = props.modelValue;
  if (props.min !== undefined) parsed = Math.max(props.min, parsed);
  if (props.max !== undefined) parsed = Math.min(props.max, parsed);
  emit('update:modelValue', parsed);
};

const handleReset = (e: MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
  if (props.defaultValue !== undefined) {
    emit('update:modelValue', props.defaultValue);
  }
  emit('reset');
};

const startInteraction = () => {
  if (isInteracting.value) return;
  isInteracting.value = true;
  beginPropertyInteraction();
  emit('interaction-start');
};

const flushRangeValue = () => {
  if (rangeFrame !== null) cancelAnimationFrame(rangeFrame);
  rangeFrame = null;
  if (pendingRangeValue === null) return;
  emit('update:modelValue', pendingRangeValue);
  pendingRangeValue = null;
};

const handleRangeInput = (event: Event) => {
  const value = parseFloat((event.target as HTMLInputElement).value);
  if (!isInteracting.value) {
    emit('update:modelValue', value);
    return;
  }
  pendingRangeValue = value;
  if (rangeFrame !== null) return;
  rangeFrame = requestAnimationFrame(() => {
    rangeFrame = null;
    if (pendingRangeValue === null) return;
    emit('update:modelValue', pendingRangeValue);
    pendingRangeValue = null;
  });
};

let keyboardInteracting = false;
const rangeKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
const startKeyboardInteraction = (event: KeyboardEvent) => {
  if (rangeKeys.includes(event.key)) {
    keyboardInteracting = true;
    startInteraction();
  }
};
const endKeyboardInteraction = (event: KeyboardEvent) => {
  if (rangeKeys.includes(event.key)) {
    keyboardInteracting = false;
    endInteraction();
  }
};
const endInteraction = () => {
  keyboardInteracting = false;
  if (!isInteracting.value) return;
  flushRangeValue();
  isInteracting.value = false;
  endPropertyInteraction();
  emit('interaction-end');
};

const cancelInteraction = () => {
  if (!isInteracting.value) return;
  emit('interaction-cancel');
  endInteraction();
};

onBeforeUnmount(() => {
  flushRangeValue();
  endInteraction();
});
</script>

<template>
  <div class="big-slider-container" :class="{ 'is-editing': isEditing, 'is-interacting': isInteracting }">
    <span
      v-if="!isEditing"
      class="big-slider-fill"
      aria-hidden="true"
      :style="{ transform: `scale3d(${percentage / 100}, 1, 1)` }"
    />
    <template v-if="isEditing">
      <div class="big-slider-edit-wrapper">
        <span class="big-slider-label edit-label">{{ label }}</span>
        <Input
          :id="`slider-input-${label.replace(/\s+/g, '-')}`"
          v-model="editValue"
          type="number"
          size="xs"
          width="72px"
          :aria-label="label"
          :min="min"
          :max="max"
          :step="step"
          autofocus
          select-on-focus
          class="slider-inline-input"
          @keydown.enter="finishEditing"
          @keydown.esc="isEditing = false"
          @blur="finishEditing"
        />
      </div>
    </template>
    <template v-else>
      <div class="big-slider-overlay">
        <span class="big-slider-label">{{ label }}</span>
        <div class="big-slider-value-area">
          <button
            v-if="defaultValue !== undefined && isChanged"
            type="button"
            class="slider-reset-btn"
            title="Reset to default"
            @pointerdown.stop
            @mousedown.stop
            @click.stop.prevent="handleReset"
          >
            <RotateCcw class="reset-icon" />
          </button>
          <span
            class="big-slider-value"
            title="Click to edit value directly"
            @pointerdown.stop
            @mousedown.stop
            @click.stop.prevent="startEditing"
          >
            {{ displayValue }}
          </span>
        </div>
      </div>
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        :aria-label="label"
        class="big-slider-input"
        @input="handleRangeInput"
        @pointerdown="startInteraction"
        @pointercancel="cancelInteraction"
        @pointerup="endInteraction"
        @blur="endInteraction"
        @keydown="startKeyboardInteraction"
        @keyup="endKeyboardInteraction"
        @change="!keyboardInteracting && endInteraction()"
      />
    </template>
  </div>
</template>

<style scoped>
.big-slider-container {
  --big-slider-height: calc(var(--control-height) + 4px);
  position: relative;
  width: 100%;
  height: var(--big-slider-height);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  overflow: hidden;
  display: flex;
  align-items: center;
  background: var(--color-bg-field);
  transition: border-color var(--fast) ease;
}

.big-slider-fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transform-origin: left center;
  background: var(--color-bg-field-active);
}

.big-slider-container:hover {
  border-color: var(--color-border-strong);
}

.big-slider-container.is-editing {
  border-color: var(--text-secondary);
}

.big-slider-container:has(.big-slider-input:focus-visible) {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}

.big-slider-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  pointer-events: none;
  z-index: 5;
}

.big-slider-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
  color: var(--text-secondary);
  pointer-events: none;
}

.big-slider-label.edit-label {
  flex-shrink: 0;
}

.big-slider-value-area {
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  position: relative;
  z-index: 10;
}

.slider-reset-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 4px;
  transition:
    color var(--fast) ease,
    background-color var(--fast) ease;
  pointer-events: auto;
  position: relative;
  z-index: 10;
}

.slider-reset-btn:hover {
  color: var(--text-primary);
  background-color: var(--color-bg-surface-hover);
}

.reset-icon {
  width: 12px;
  height: 12px;
}

.big-slider-value {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
  color: var(--text-primary);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition:
    background-color var(--fast) ease,
    color var(--fast) ease;
  pointer-events: auto;
  position: relative;
  z-index: 10;
}

.big-slider-value:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.big-slider-edit-wrapper {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 10px;
  background: var(--color-bg-field);
  z-index: 10;
  gap: 8px;
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
  height: calc(var(--big-slider-height) - 10px);
  background: var(--text-secondary);
  cursor: ew-resize;
  border: none;
  border-radius: var(--radius-sm);
  transition: transform var(--fast) ease;
}

.big-slider-container:hover .big-slider-input::-webkit-slider-thumb,
.big-slider-container.is-interacting .big-slider-input::-webkit-slider-thumb {
  transform: scale(1.5, 1.2);
}

/* Firefox */
.big-slider-input::-moz-range-thumb {
  width: 2px;
  height: calc(var(--big-slider-height) - 10px);
  background: var(--text-secondary);
  cursor: ew-resize;
  border: none;
  border-radius: var(--radius-sm);
  transition: transform var(--fast) ease;
}

.big-slider-container:hover .big-slider-input::-moz-range-thumb,
.big-slider-container.is-interacting .big-slider-input::-moz-range-thumb {
  transform: scale(1.5, 1.2);
}

@media (prefers-reduced-motion: reduce) {
  .big-slider-input::-webkit-slider-thumb {
    transition: none;
  }
  .big-slider-input::-moz-range-thumb {
    transition: none;
  }
}
</style>
