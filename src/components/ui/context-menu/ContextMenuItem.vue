<script setup lang="ts">
import type { Component } from 'vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    icon?: Component;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    active?: boolean;
  }>(),
  {
    label: '',
    icon: undefined,
    shortcut: '',
    disabled: false,
    danger: false,
    active: false,
  },
);

const emit = defineEmits<{
  (event: 'click', e: MouseEvent): void;
}>();

const handleClick = (e: MouseEvent) => {
  if (props.disabled) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  emit('click', e);
};
</script>

<template>
  <button
    type="button"
    class="context-menu-item"
    :class="{
      'is-disabled': disabled,
      'is-danger': danger,
      'is-active': active,
      'has-icon': Boolean(icon || $slots.icon),
    }"
    :disabled="disabled"
    role="menuitem"
    @click="handleClick"
  >
    <span v-if="icon || $slots.icon" class="item-icon-wrapper">
      <slot name="icon">
        <component :is="icon" v-if="icon" class="item-icon" />
      </slot>
    </span>

    <span class="item-label">
      <slot>{{ label }}</slot>
    </span>

    <span v-if="shortcut || $slots.shortcut" class="item-shortcut">
      <slot name="shortcut">{{ shortcut }}</slot>
    </span>
  </button>
</template>

<style scoped>
.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--fast, 0.15s) ease,
    color var(--fast, 0.15s) ease;
  box-sizing: border-box;
}

.context-menu-item:hover:not(:disabled),
.context-menu-item:focus-visible:not(:disabled),
.context-menu-item.is-active:not(:disabled) {
  background-color: var(--color-bg-surface-hover, rgba(255, 255, 255, 0.08));
  color: var(--text-primary);
  outline: none;
}

.context-menu-item.is-danger {
  color: var(--color-error, #f43f5e);
}

.context-menu-item.is-danger:hover:not(:disabled),
.context-menu-item.is-danger:focus-visible:not(:disabled) {
  background-color: var(--color-error-light, rgba(244, 63, 94, 0.12));
  color: var(--color-error, #f43f5e);
}

.context-menu-item.is-disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.item-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.context-menu-item:hover:not(:disabled) .item-icon-wrapper {
  color: var(--text-primary);
}

.context-menu-item.is-danger .item-icon-wrapper,
.context-menu-item.is-danger:hover:not(:disabled) .item-icon-wrapper {
  color: var(--color-error, #f43f5e);
}

.item-icon {
  width: 14px;
  height: 14px;
}

.item-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-shortcut {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
</style>
