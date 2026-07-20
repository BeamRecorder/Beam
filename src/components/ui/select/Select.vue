<script setup lang="ts">
import { computed } from 'vue'
import Popover from '../popover/Popover.vue'
import { ChevronDown, Check } from '@lucide/vue'

interface Option {
  value: string | number
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null
    options: Option[]
    placeholder?: string
    disabled?: boolean
    direction?: 'up' | 'down'
  }>(),
  {
    placeholder: 'Select an option',
    disabled: false,
    direction: 'down',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
  (e: 'toggle', isOpen: boolean): void
}>()

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue) || null
})

const handleSelect = (option: Option, close: () => void) => {
  if (props.disabled) return
  emit('update:modelValue', option.value)
  close()
}
const labelStyle = computed(() => {
  const text = selectedOption.value ? selectedOption.value.label : props.placeholder
  const len = text.length
  if (len > 28) return { fontSize: '0.75rem' }
  if (len > 20) return { fontSize: '0.85rem' }
  return {}
})
</script>

<template>
  <Popover align="left" :direction="direction" :block="true" class="select-popover" @toggle="$emit('toggle', $event)">
    <template #trigger="{ isOpen }">
      <button 
        type="button" 
        class="select-trigger" 
        :class="{ 'is-open': isOpen, 'is-disabled': disabled }" 
        :disabled="disabled"
      >
        <span 
          class="select-label" 
          :class="{ 'is-placeholder': !selectedOption }"
          :style="labelStyle"
        >
          {{ selectedOption ? selectedOption.label : placeholder }}
        </span>
        <ChevronDown class="select-chevron" :class="{ 'rotate': isOpen }" />
      </button>
    </template>
    
    <template #default="{ close }">
      <ul class="select-options">
        <li 
          v-for="option in options" 
          :key="option.value" 
          class="select-option"
          :class="{ 'is-selected': option.value === modelValue }"
          @click="handleSelect(option, close)"
        >
          <span class="option-label">{{ option.label }}</span>
          <Check v-if="option.value === modelValue" class="option-check" />
        </li>
      </ul>
    </template>
  </Popover>
</template>

<style scoped>
.select-popover {
  width: 100%;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 80px;
  height: 2.75rem;
  padding: 0.6rem 1rem;
  background-color: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 1rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.select-trigger:hover:not(.is-disabled) {
  border-color: var(--color-border-strong);
}

.select-trigger.is-open {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.select-trigger.is-disabled {
  background-color: var(--color-bg-surface);
  color: var(--text-muted);
  cursor: not-allowed;
}

.select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-label.is-placeholder {
  color: var(--text-muted);
}

.select-chevron {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}

.select-chevron.rotate {
  transform: rotate(180deg);
}

.select-options {
  list-style: none;
  padding: 0 4px;
  margin: 0;
  max-height: 140px;
  overflow-y: auto;
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.select-option:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.select-option.is-selected {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;
}

.option-check {
  width: 1rem;
  height: 1rem;
  color: var(--color-primary);
}
</style>
