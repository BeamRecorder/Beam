<script lang="ts">
export default {
  inheritAttrs: false
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import Tooltip from '../tooltip/Tooltip.vue'
import { Loader } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'tab'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    disabled?: boolean
    block?: boolean
    tooltip?: string
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right'
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
    block: false,
    tooltip: '',
    tooltipPosition: 'top',
    type: 'button',
  }
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const buttonClasses = computed(() => {
  return [
    'btn',
    `btn-${props.variant}`,
    `btn-${props.size}`,
    { 'btn-loading': props.loading },
    { 'btn-block': props.block },
  ]
})

const handleClick = (event: MouseEvent) => {
  if (props.disabled || props.loading) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component
    :is="tooltip ? Tooltip : 'div'"
    v-bind="tooltip ? { content: tooltip, position: tooltipPosition } : {}"
    :class="['btn-container', { 'btn-block': block }]"
  >
    <button
      v-bind="$attrs"
      :type="type"
      :class="buttonClasses"
      :disabled="disabled || loading"
      @click="handleClick"
    >
      <Loader v-if="loading" class="icon-spin btn-icon" />
      <span v-if="$slots.icon && !loading" class="btn-icon-wrapper">
        <slot name="icon" />
      </span>
      <span v-if="$slots.default" class="btn-content">
        <slot />
      </span>
    </button>
  </component>
</template>

<style scoped>
.btn-container {
  display: inline-block;
}

.btn-container.btn-block {
  display: block;
  width: 100%;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: var(--font-sans);
  font-weight: 600;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  white-space: nowrap;
  user-select: none;
}

.btn.btn-block {
  width: 100%;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Sizes */
.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.875rem;
  height: 2.25rem;
}

.btn-md {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  height: 2.75rem;
}

.btn-lg {
  padding: 0.8rem 1.6rem;
  font-size: 1.125rem;
  height: 3.25rem;
}

/* Variants */
.btn-primary {
  background-color: var(--color-orange);
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-orange-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 90, 31, 0.2);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-secondary {
  background-color: var(--color-blue);
  color: white;
}
.btn-secondary:hover:not(:disabled) {
  background-color: var(--color-blue-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}
.btn-secondary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-outline {
  background-color: transparent;
  border-color: var(--color-border);
  color: var(--text-primary);
}
.btn-outline:hover:not(:disabled) {
  background-color: var(--color-light-blue-hover);
  border-color: var(--color-border-dark);
}

.btn-ghost {
  background-color: transparent;
  color: var(--text-primary);
}
.btn-ghost:hover:not(:disabled) {
  background-color: var(--color-light-blue-hover);
}

.btn-link {
  background-color: transparent;
  color: var(--color-orange);
  padding: 0 !important;
  height: auto !important;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.btn-link:hover:not(:disabled) {
  color: var(--color-orange-hover);
}

/* Tab/Segmented Variant */
.btn-tab {
  flex: 1;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  box-shadow: none;
  font-size: 13px;
  font-weight: 600;
  height: auto;
  padding: 6px 12px;
  transition: all 0.2s ease;
  justify-content: center;
}

.btn-tab:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.02);
  transform: none;
  box-shadow: none;
}

:root.dark .btn-tab:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.02);
}

.btn-tab.active {
  background: var(--color-bg-element);
  color: var(--color-orange);
  box-shadow: var(--shadow-sm);
  border-color: var(--color-border);
}

.btn-tab.active:hover:not(:disabled) {
  background: var(--color-bg-element);
}

/* Loader and Icon Animation */
.icon-spin {
  animation: spin 1s linear infinite;
}

.btn-icon {
  width: 1.15em;
  height: 1.15em;
}

.btn-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
