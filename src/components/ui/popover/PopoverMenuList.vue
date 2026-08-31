<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { ChevronRight } from '@lucide/vue';
import type { PopoverMenuItem } from './popover-menu-types';

const props = withDefaults(defineProps<{ items: readonly PopoverMenuItem[]; level?: number }>(), { level: 0 });
const emit = defineEmits<{
  select: [id: string];
  dismiss: [];
  close: [];
}>();
const openItemId = ref<string | null>(null);
const submenuSides = ref<Record<string, 'left' | 'right'>>({});
const itemElements = new Map<string, HTMLButtonElement>();

const setItemElement = (id: string, element: Element | null) => {
  if (element instanceof HTMLButtonElement) itemElements.set(id, element);
  else itemElements.delete(id);
};
const enabledItems = () => props.items.filter((item) => !item.disabled);
const focusItem = (item: PopoverMenuItem | undefined) => item && itemElements.get(item.id)?.focus();
const setSubmenuSide = (item: PopoverMenuItem, element: HTMLElement) => {
  submenuSides.value = {
    ...submenuSides.value,
    [item.id]: window.innerWidth - element.getBoundingClientRect().right < 190 ? 'left' : 'right',
  };
};
const openSubmenu = (item: PopoverMenuItem, element: HTMLElement, focusFirst = false) => {
  if (!item.children?.length || item.disabled) return;
  setSubmenuSide(item, element);
  openItemId.value = item.id;
  if (!focusFirst) return;
  void nextTick(() => {
    const entry = element.closest('.menu-entry');
    entry?.querySelector<HTMLButtonElement>(':scope > .submenu-panel > .menu-entry > .menu-item')?.focus();
  });
};
const closeSubmenu = (item: PopoverMenuItem) => {
  openItemId.value = null;
  void nextTick(() => focusItem(item));
};
const activate = (item: PopoverMenuItem, event: MouseEvent) => {
  if (item.disabled) return;
  if (item.children?.length) {
    if (openItemId.value === item.id) openItemId.value = null;
    else openSubmenu(item, event.currentTarget as HTMLElement);
    return;
  }
  emit('select', item.id);
};
const moveFocus = (item: PopoverMenuItem, delta: number) => {
  const items = enabledItems();
  const current = items.findIndex((entry) => entry.id === item.id);
  focusItem(items[(current + delta + items.length) % items.length]);
};
const handleKeydown = (event: KeyboardEvent, item: PopoverMenuItem) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveFocus(item, event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const items = enabledItems();
    focusItem(event.key === 'Home' ? items[0] : items.at(-1));
  } else if (event.key === 'ArrowRight' && item.children?.length) {
    event.preventDefault();
    openSubmenu(item, event.currentTarget as HTMLElement, true);
  } else if (event.key === 'ArrowLeft' && props.level > 0) {
    event.preventDefault();
    emit('close');
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('dismiss');
  }
};
</script>

<template>
  <div class="menu-content" role="menu" @mouseleave="openItemId = null">
    <div v-for="item in items" :key="item.id" class="menu-entry">
      <button
        :ref="(element) => setItemElement(item.id, element as Element | null)"
        class="menu-item"
        :class="{ active: item.active, 'has-icon': Boolean(item.icon), 'has-children': Boolean(item.children?.length) }"
        :disabled="item.disabled"
        role="menuitem"
        :aria-haspopup="item.children?.length ? 'menu' : undefined"
        :aria-expanded="item.children?.length ? openItemId === item.id : undefined"
        @mouseenter="
          item.children?.length ? openSubmenu(item, $event.currentTarget as HTMLElement) : (openItemId = null)
        "
        @click="activate(item, $event)"
        @keydown="handleKeydown($event, item)"
      >
        <span v-if="item.icon" class="item-icon-wrapper" aria-hidden="true">
          <component :is="item.icon" class="menu-item-icon" />
        </span>
        <span class="item-label">{{ item.label }}</span>
        <ChevronRight v-if="item.children?.length" class="submenu-chevron" aria-hidden="true" />
      </button>
      <PopoverMenuList
        v-if="item.children?.length && openItemId === item.id"
        class="submenu-panel"
        :class="`opens-${submenuSides[item.id] ?? 'right'}`"
        :items="item.children"
        :level="level + 1"
        @select="emit('select', $event)"
        @dismiss="emit('dismiss')"
        @close="closeSubmenu(item)"
      />
    </div>
  </div>
</template>

<style scoped>
.menu-content {
  display: flex;
  flex-direction: column;
  min-width: 144px;
  width: max-content;
  max-width: min(280px, calc(100vw - 16px));
  padding: 4px;
  background: var(--color-bg-element);
  box-sizing: border-box;
}
.menu-entry {
  position: relative;
}
.menu-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font: 500 12px var(--font-sans);
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}
.menu-item.has-icon {
  grid-template-columns: 18px 1fr auto;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.submenu-chevron {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}
.menu-item:hover:not(:disabled),
.menu-item:focus-visible:not(:disabled),
.menu-item.active {
  outline: none;
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.submenu-panel {
  position: absolute;
  top: -4px;
  z-index: 1;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}
.submenu-panel.opens-right {
  left: calc(100% - 2px);
}
.submenu-panel.opens-left {
  right: calc(100% - 2px);
}
</style>
