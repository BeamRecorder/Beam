<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    disabled?: boolean
    label?: string
  }>(),
  {
    disabled: false,
    label: '',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toggle = () => {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div 
    class="switch-container" 
    :class="{ 'is-disabled': disabled }" 
    @click="toggle"
  >
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="switch-button"
      :class="{ 'is-checked': modelValue }"
    >
      <span class="switch-thumb" :class="{ 'is-checked': modelValue }" />
    </button>
    <span v-if="label" class="switch-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.switch-container {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.switch-container.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.switch-button {
  position: relative;
  width: 44px;
  height: 24px;
  background-color: var(--color-border);
  border: none;
  border-radius: var(--radius-full);
  cursor: inherit;
  outline: none;
  transition: background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  padding: 2px;
}

.switch-button:focus-visible {
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.switch-button.is-checked {
  background-color: var(--color-primary);
}

.switch-thumb {
  width: 20px;
  height: 20px;
  background-color: white;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transform: translateX(0);
}

.switch-thumb.is-checked {
  transform: translateX(20px);
}

.switch-label {
  font-family: var(--font-sans);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-secondary);
}
</style>
