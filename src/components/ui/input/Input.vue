<script setup lang="ts">
import { ref, useAttrs, onMounted } from "vue";
import { beginPropertyInteraction, endPropertyInteraction } from "~/composables/property-interaction";

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean | string;
    id?: string;
    size?: "sm" | "md";
    width?: string;
    min?: number;
    max?: number;
    step?: number;
    autofocus?: boolean;
    selectOnFocus?: boolean;
  }>(),
  {
    type: "text",
    step: 1,
    autofocus: false,
    selectOnFocus: false,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string | number): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const focusInput = () => {
  if (!inputRef.value) return;
  inputRef.value.focus();
  if (props.selectOnFocus || props.autofocus) {
    inputRef.value.select();
  }
};

onMounted(() => {
  if (props.autofocus) {
    focusInput();
    setTimeout(focusInput, 60);
  }
});

defineExpose({
  focus: focusInput,
  select: () => inputRef.value?.select(),
  inputRef,
});

const isDragging = ref(false);

const handleMouseDown = (e: MouseEvent) => {
  if (props.disabled || props.type !== "number") return;

  // Only allow drag on left click
  if (e.button !== 0) return;

  const startX = e.clientX;
  const startValue = parseFloat(String(props.modelValue)) || 0;
  let hasDragged = false;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const deltaX = moveEvent.clientX - startX;
    if (!hasDragged && Math.abs(deltaX) > 4) {
      hasDragged = true;
      isDragging.value = true;
      beginPropertyInteraction();
      document.body.style.cursor = "ew-resize";
      document.body.classList.add("is-dragging-input");
    }

    if (hasDragged) {
      moveEvent.preventDefault();
      const multiplier = moveEvent.shiftKey ? 10 : 1;
      const stepVal = props.step ?? 1;

      // Let's change the value by stepVal for every 4 pixels of horizontal drag
      const deltaValue = (deltaX / 4) * stepVal * multiplier;
      let newValue = startValue + deltaValue;

      // Round value to avoid float precision issues
      const decimals = (stepVal.toString().split(".")[1] || "").length;
      newValue = parseFloat(newValue.toFixed(decimals));

      if (props.min !== undefined && newValue < props.min) {
        newValue = props.min;
      }
      if (props.max !== undefined && newValue > props.max) {
        newValue = props.max;
      }

      emit("update:modelValue", newValue);
    }
  };

  const preventClick = (clickEvent: MouseEvent) => {
    clickEvent.preventDefault();
    clickEvent.stopPropagation();
    window.removeEventListener("click", preventClick, true);
  };

  const handleMouseUp = (_upEvent: MouseEvent) => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);

    if (hasDragged) {
      isDragging.value = false;
      endPropertyInteraction();
      document.body.style.cursor = "";
      document.body.classList.remove("is-dragging-input");
      window.addEventListener("click", preventClick, true);
      setTimeout(() => {
        window.removeEventListener("click", preventClick, true);
      }, 50);
    }
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
};
</script>

<template>
  <div
    class="input-wrapper"
    :class="[
      {
        'is-disabled': disabled,
        'is-error': !!error,
        'is-number': type === 'number',
        'is-dragging': isDragging,
      },
      `input-${size || 'md'}`,
    ]"
    :style="width ? { width } : undefined"
  >
    <div v-if="$slots.prefix" class="input-prefix">
      <slot name="prefix" />
    </div>
    <input
      ref="inputRef"
      v-bind="attrs"
      :id="id"
      :type="type || 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :min="min"
      :max="max"
      :step="step"
      class="input-element"
      @input="
        $emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
      @mousedown="handleMouseDown"
    />
    <div v-if="$slots.suffix" class="input-suffix">
      <slot name="suffix" />
    </div>
  </div>
  <span v-if="typeof error === 'string' && error" class="input-error-msg">
    {{ error }}
  </span>
</template>

<style scoped>
.input-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  height: 2.75rem;
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 0.75rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.input-wrapper.is-number:not(:focus-within) {
  cursor: ew-resize;
}

.input-wrapper.is-number:not(:focus-within) .input-element {
  cursor: ew-resize;
}

.input-wrapper.is-dragging {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.input-wrapper.input-sm {
  height: 2rem;
}

.input-wrapper.input-sm .input-element {
  font-size: 0.8125rem;
}

.input-wrapper:focus-within:not(.is-disabled):not(.is-error) {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.input-wrapper.is-disabled {
  background-color: var(--color-bg-surface);
  color: var(--text-muted);
  cursor: not-allowed;
}

.input-element {
  flex-grow: 1;
  border: none;
  background: transparent;
  height: 100%;
  font-family: var(--font-sans);
  font-size: 1rem;
  color: var(--text-primary);
  outline: none;
  width: 100%;
}

/* Hide HTML5 Number Spinners (Arrows) */
.input-element[type="number"]::-webkit-outer-spin-button,
.input-element[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.input-element[type="number"] {
  -moz-appearance: textfield;
  appearance: inherit;
}

.input-element:disabled {
  cursor: not-allowed;
}

.input-element::placeholder {
  color: var(--text-muted);
}

.input-prefix {
  margin-right: 8px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  user-select: none;
}

.input-suffix {
  margin-left: 8px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  user-select: none;
}

.input-wrapper.is-error {
  border-color: var(--color-error);
}

.input-wrapper.is-error:focus-within {
  box-shadow: 0 0 0 2px var(--color-error-light);
}

.input-error-msg {
  display: block;
  font-size: 0.8rem;
  color: var(--color-error);
  margin-top: 4px;
  font-weight: 500;
}
</style>
