<script setup lang="ts">
defineProps<{
  modelValue: string | number
  type?: string
  placeholder?: string
  disabled?: boolean
  error?: boolean | string
  id?: string
  size?: 'sm' | 'md'
  width?: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <div
    class="input-wrapper"
    :class="[{ 'is-disabled': disabled, 'is-error': !!error }, `input-${size || 'md'}`]"
    :style="width ? { width } : undefined"
  >
    <div v-if="$slots.prefix" class="input-prefix">
      <slot name="prefix" />
    </div>
    <input
      :id="id"
      :type="type || 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      class="input-element"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
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
  background-color: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 0.75rem;
  transition: all 0.2s ease;
}

.input-wrapper.input-sm {
  height: 2rem;
}

.input-wrapper.input-sm .input-element {
  font-size: 0.8125rem;
}

.input-wrapper:focus-within:not(.is-disabled):not(.is-error) {
  border-color: var(--color-orange);
  box-shadow: 0 0 0 2px var(--color-orange-light);
}

.input-wrapper.is-disabled {
  background-color: var(--color-light-blue);
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
}

.input-suffix {
  margin-left: 8px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
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
