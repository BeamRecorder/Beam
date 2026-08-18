<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { Check, Minus } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    label?: string;
    ariaLabel?: string;
    size?: 'sm' | 'md';
  }>(),
  {
    modelValue: false,
    indeterminate: false,
    disabled: false,
    label: '',
    ariaLabel: '',
    size: 'md',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'change', value: boolean): void;
}>();

const labelWrapperRef = ref<HTMLElement | null>(null);
const labelRef = ref<HTMLElement | null>(null);

let marqueeFrame = 0;
let marqueeTimer: ReturnType<typeof setTimeout> | null = null;

const stopMarquee = () => {
  if (marqueeFrame) {
    cancelAnimationFrame(marqueeFrame);
    marqueeFrame = 0;
  }
  if (marqueeTimer) {
    clearTimeout(marqueeTimer);
    marqueeTimer = null;
  }
  if (labelWrapperRef.value) {
    labelWrapperRef.value.classList.remove('has-left-overflow', 'has-right-overflow', 'has-overflow');
  }
  if (labelRef.value) {
    labelRef.value.style.transform = '';
  }
};

const startMarquee = () => {
  const wrapper = labelWrapperRef.value;
  const label = labelRef.value;
  if (!wrapper || !label) return;

  const distance = label.scrollWidth - wrapper.clientWidth;
  if (distance <= 0) {
    wrapper.classList.remove('has-overflow', 'has-left-overflow', 'has-right-overflow');
    return;
  }

  stopMarquee();

  marqueeTimer = setTimeout(() => {
    if (!labelWrapperRef.value || !labelRef.value) return;
    const currentDistance = labelRef.value.scrollWidth - labelWrapperRef.value.clientWidth;
    if (currentDistance <= 0) return;

    labelWrapperRef.value.classList.add('has-overflow', 'has-right-overflow');
    const startedAt = performance.now();
    const travelMs = Math.max(3000, (currentDistance / 36) * 1000);
    const tick = (now: number) => {
      const phase = ((now - startedAt) % (travelMs * 2)) / travelMs;
      const progress = phase <= 1 ? phase : 2 - phase;
      if (labelRef.value) {
        labelRef.value.style.transform = `translateX(${-currentDistance * progress}px)`;
      }
      if (labelWrapperRef.value) {
        labelWrapperRef.value.classList.toggle('has-left-overflow', progress > 0.015);
        labelWrapperRef.value.classList.toggle('has-right-overflow', progress < 0.985);
      }
      marqueeFrame = requestAnimationFrame(tick);
    };
    marqueeFrame = requestAnimationFrame(tick);
  }, 400);
};

onBeforeUnmount(() => {
  stopMarquee();
});

const toggle = () => {
  if (props.disabled) return;
  const nextValue = !props.modelValue;
  emit('update:modelValue', nextValue);
  emit('change', nextValue);
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    toggle();
  }
};
</script>

<template>
  <div
    class="checkbox-container"
    :class="[
      `size-${size}`,
      {
        'is-disabled': disabled,
        'is-checked': modelValue,
        'is-indeterminate': indeterminate,
      },
    ]"
    @click="toggle"
    @pointerenter="startMarquee"
    @pointerleave="stopMarquee"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="indeterminate ? 'mixed' : modelValue"
      :aria-label="ariaLabel || label || undefined"
      :disabled="disabled"
      class="checkbox-box"
      :class="{
        'is-checked': modelValue || indeterminate,
        'is-indeterminate': indeterminate,
      }"
      tabindex="0"
      @keydown="handleKeyDown"
    >
      <Check v-if="modelValue && !indeterminate" class="checkbox-icon" />
      <Minus v-else-if="indeterminate" class="checkbox-icon checkbox-minus" />
    </button>
    <span v-if="label" ref="labelWrapperRef" class="checkbox-label-wrapper" :title="label">
      <span ref="labelRef" class="checkbox-label">
        {{ label }}
      </span>
    </span>
  </div>
</template>

<style scoped>
.checkbox-container {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-family: var(--font-sans);
  min-width: 0;
  max-width: 100%;
}

.checkbox-container.size-sm {
  gap: 6px;
}

.checkbox-container.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.checkbox-box {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-bg-element);
  color: #ffffff;
  cursor: inherit;
  outline: none;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  flex-shrink: 0;
}

.size-md .checkbox-box {
  width: 18px;
  height: 18px;
}

.size-sm .checkbox-box {
  width: 15px;
  height: 15px;
  border-radius: 4px;
}

.checkbox-box:focus-visible {
  box-shadow: 0 0 0 2px var(--color-primary-light);
  border-color: var(--color-primary);
}

.checkbox-container:hover:not(.is-disabled) .checkbox-box:not(.is-checked) {
  border-color: var(--color-primary);
}

.checkbox-box.is-checked {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox-icon {
  width: 12px;
  height: 12px;
  stroke-width: 3;
}

.size-sm .checkbox-icon {
  width: 10px;
  height: 10px;
  stroke-width: 3;
}

.checkbox-label-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.checkbox-label {
  display: inline-block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
  max-width: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.checkbox-label-wrapper.has-overflow .checkbox-label {
  text-overflow: clip;
  overflow: visible;
  will-change: transform;
}

.checkbox-label-wrapper.has-right-overflow::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 14px;
  pointer-events: none;
  background: linear-gradient(to right, transparent, var(--color-bg-surface-hover));
  box-shadow: inset -6px 0 8px -7px var(--marquee-fade-shadow, rgba(0, 0, 0, 0.35));
}

.checkbox-label-wrapper.has-left-overflow::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 14px;
  pointer-events: none;
  z-index: 1;
  background: linear-gradient(to right, var(--color-bg-surface-hover), transparent);
  box-shadow: inset 6px 0 8px -7px var(--marquee-fade-shadow, rgba(0, 0, 0, 0.35));
}

.size-sm .checkbox-label {
  font-size: 11px;
}
</style>
