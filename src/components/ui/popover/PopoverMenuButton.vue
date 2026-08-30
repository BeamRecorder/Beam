<script setup lang="ts">
import type { Component } from 'vue';
import { ChevronDown, ChevronUp } from '@lucide/vue';
import Popover from './Popover.vue';

export interface PopoverMenuItem {
  id: string;
  label: string;
  icon?: Component;
  disabled?: boolean;
  active?: boolean;
}
const props = defineProps<{
  label: string;
  items: readonly PopoverMenuItem[];
  icon?: Component;
  disabled?: boolean;
  ariaLabel?: string;
  transparent?: boolean;
  direction?: 'up' | 'down';
  block?: boolean;
  bare?: boolean;
}>();
const emit = defineEmits<{ (event: 'select', id: string): void }>();
</script>

<template>
  <Popover align="left" :direction="direction" :block="block" :match-trigger-width="false">
    <template #trigger="{ isOpen }">
      <button
        class="menu-button"
        :class="{ 'is-open': isOpen, transparent, block, bare }"
        :disabled="disabled"
        type="button"
        :aria-label="ariaLabel || label"
        aria-haspopup="menu"
        :aria-expanded="isOpen"
      >
        <component :is="icon" v-if="icon" class="menu-button-icon" />
        <span>{{ label }}</span
        ><component
          :is="direction === 'up' ? ChevronUp : ChevronDown"
          class="menu-button-chevron"
          :class="{ 'is-open': isOpen }"
        />
      </button>
    </template>
    <template #default="{ close }">
      <div class="menu-content" role="menu">
        <button
          v-for="item in items"
          :key="item.id"
          class="menu-item"
          :class="{ active: item.active, 'has-icon': Boolean(item.icon) }"
          :disabled="item.disabled"
          role="menuitem"
          @click="
            emit('select', item.id);
            close();
          "
        >
          <span v-if="item.icon" class="item-icon-wrapper">
            <component :is="item.icon" class="menu-item-icon" />
          </span>
          <span class="item-label">{{ item.label }}</span>
        </button>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.menu-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--text-primary);
  font: 600 12px var(--font-sans);
  cursor: pointer;
}
.menu-button.block {
  width: 100%;
  justify-content: center;
}
.menu-button.bare,
.menu-button.bare:hover:not(:disabled),
.menu-button.bare.is-open {
  border-color: transparent;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.menu-button.transparent {
  background: transparent;
  box-shadow: var(--shadow-sm);
}
.menu-button:hover:not(:disabled),
.menu-button.is-open {
  background: var(--color-bg-surface-hover);
  border-color: var(--color-border-strong);
}
.menu-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.menu-button-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}
.menu-button-chevron {
  width: 12px;
  height: 12px;
  color: var(--text-muted);
  transition: transform var(--fast) ease;
}
.menu-button-chevron.is-open {
  transform: rotate(180deg);
}
.menu-content {
  display: flex;
  flex-direction: column;
  min-width: 108px;
  padding: 4px;
  background: var(--color-bg-element);
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font: 500 12px var(--font-sans);
  text-align: center;
  cursor: pointer;
  box-sizing: border-box;
}
.menu-item.has-icon {
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  text-align: left;
  justify-content: start;
}
.item-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}
.menu-item-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
}
.item-label {
  white-space: nowrap;
}
.menu-item:hover:not(:disabled),
.menu-item.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
