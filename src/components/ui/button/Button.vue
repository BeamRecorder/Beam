<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { computed, type Component } from "vue";
import Tooltip from "../tooltip/Tooltip.vue";
import { Loader } from "@lucide/vue";

const props = withDefaults(
  defineProps<{
    variant?:
      | "primary"
      | "secondary"
      | "outline"
      | "ghost"
      | "link"
      | "tab"
      | "card"
      | "danger";
    size?: "xs" | "sm" | "md" | "lg";
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    tooltip?: string;
    tooltipPosition?: "top" | "bottom" | "left" | "right";
    tooltipVariant?: "default" | "error";
    type?: "button" | "submit" | "reset";
    icon?: Component;
    iconOnly?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    loading: false,
    disabled: false,
    block: false,
    tooltip: "",
    tooltipPosition: "top",
    tooltipVariant: "default",
    type: "button",
    iconOnly: false,
  },
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const buttonClasses = computed(() => {
  return [
    "btn",
    `btn-${props.variant}`,
    `btn-${props.size}`,
    { "btn-loading": props.loading },
    { "btn-block": props.block },
    { "btn-icon-only": props.iconOnly },
  ];
});

const handleClick = (event: MouseEvent) => {
  if (props.disabled || props.loading) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  emit("click", event);
};
</script>

<template>
  <component
    :is="tooltip ? Tooltip : 'div'"
    v-bind="tooltip ? { content: tooltip, position: tooltipPosition, variant: disabled ? 'error' : tooltipVariant } : {}"
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
      <span v-if="icon && !$slots.icon && !loading" class="btn-icon-wrapper">
        <component :is="icon" class="btn-icon" />
      </span>
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
  min-width: 0;
}

.btn.btn-block {
  width: 100%;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Sizes */
.btn-xs {
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  height: 1.5rem;
}

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
  background-color: var(--color-primary);
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
  transform: translateY(-1px);
}
.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-secondary {
  background-color: var(--color-bg-element);
  border-color: var(--color-border);
  color: var(--text-primary);
}
.btn-secondary:hover:not(:disabled) {
  background-color: var(--color-bg-surface-hover);
  border-color: var(--color-border-dark);
}

.btn-danger {
  background-color: var(--color-error);
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background-color: #dc2626;
  transform: translateY(-1px);
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
  background-color: var(--color-bg-surface-hover);
  border-color: var(--color-border-dark);
}

.btn-ghost {
  background-color: transparent;
  color: var(--text-primary);
  border-color: transparent;
}
.btn-ghost:hover:not(:disabled) {
  background-color: var(--color-bg-surface, #1e1e1e);
  border-color: transparent;
}

.btn-link {
  background-color: transparent;
  color: var(--color-primary);
  padding: 0 !important;
  height: auto !important;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.btn-link:hover:not(:disabled) {
  color: var(--color-primary-hover);
}

.btn-card {
  width: 100%;
  height: 100%;
  padding: 0;
  align-items: stretch;
  justify-content: flex-start;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  text-align: left;
  background: var(--color-bg-element);
  border-color: var(--color-border);
  color: var(--text-primary);
}

.btn-card:hover:not(:disabled) {
  border-color: var(--color-primary-border);
  transform: translateY(-1px);
  box-shadow: none;
}

.btn-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.btn-card.is-selected {
  border-color: var(--color-primary);
}

.btn-card .btn-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 0;
}

.btn-icon-only {
  width: 32px;
  height: 32px;
  padding: 0;
}

.btn-icon-only.btn-xs {
  width: 20px;
  height: 20px;
  padding: 0;
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
  color: var(--color-primary);
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

.btn-content {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
