<script setup lang="ts">
import { computed, nextTick, ref, type Component } from 'vue';
import { ChevronDown, ChevronUp } from '@lucide/vue';
import Popover from './Popover.vue';
import PopoverMenuList from './PopoverMenuList.vue';
import type { PopoverMenuItem } from './popover-menu-types';
export type { PopoverMenuItem } from './popover-menu-types';

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
const trigger = ref<HTMLButtonElement | null>(null);
const hasNestedItems = computed(() => props.items.some((item) => Boolean(item.children?.length)));
const dismiss = (close: () => void) => {
  close();
  void nextTick(() => trigger.value?.focus());
};
const select = (id: string, close: () => void) => {
  emit('select', id);
  dismiss(close);
};
</script>

<template>
  <Popover
    align="left"
    :direction="direction"
    :block="block"
    :match-trigger-width="false"
    :allow-overflow="hasNestedItems"
  >
    <template #trigger="{ isOpen }">
      <button
        ref="trigger"
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
      <PopoverMenuList :items="items" @select="select($event, close)" @dismiss="dismiss(close)" />
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
</style>
