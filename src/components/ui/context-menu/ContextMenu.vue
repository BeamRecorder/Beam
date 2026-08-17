<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ContextMenuItemOrDivider, ContextMenuItemOption, ContextMenuPosition } from './context-menu-types';
import ContextMenuItem from './ContextMenuItem.vue';
import ContextMenuDivider from './ContextMenuDivider.vue';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    x?: number;
    y?: number;
    items?: readonly ContextMenuItemOrDivider[];
    minWidth?: number | string;
    closeOnSelect?: boolean;
    closeOnWindowBlur?: boolean;
  }>(),
  {
    isOpen: undefined,
    x: 0,
    y: 0,
    items: undefined,
    minWidth: 160,
    closeOnSelect: true,
    closeOnWindowBlur: true,
  },
);

const emit = defineEmits<{
  (e: 'update:isOpen', isOpen: boolean): void;
  (e: 'select', id: string): void;
  (e: 'open', position: ContextMenuPosition): void;
  (e: 'close'): void;
}>();

const internalIsOpen = ref(false);
const internalPosition = ref<ContextMenuPosition>({ x: props.x, y: props.y });
const menuRef = ref<HTMLElement | null>(null);
const floatingStyle = ref<Record<string, string>>({});

const isControlled = computed(() => props.isOpen !== undefined);
const activeIsOpen = computed(() => (isControlled.value ? Boolean(props.isOpen) : internalIsOpen.value));
type RenderedMenuItem = { type: 'divider'; key: string } | { type: 'item'; key: string; item: ContextMenuItemOption };
const renderedItems = computed<RenderedMenuItem[]>(() =>
  (props.items ?? []).map((item, index) =>
    'isDivider' in item && item.isDivider
      ? { type: 'divider', key: item.id ?? `divider-${index}` }
      : { type: 'item', key: item.id ?? `item-${index}`, item: item as ContextMenuItemOption },
  ),
);

const VIEWPORT_MARGIN = 8;

const minWidthStyle = computed(() => {
  if (typeof props.minWidth === 'number') return `${props.minWidth}px`;
  return props.minWidth;
});

const adjustPosition = async () => {
  if (!activeIsOpen.value) return;
  await nextTick();
  const el = menuRef.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const posX = isControlled.value ? props.x : internalPosition.value.x;
  const posY = isControlled.value ? props.y : internalPosition.value.y;

  let left = posX;
  let top = posY;

  // Horizontal clamping / flipping
  if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, posX - rect.width);
  }
  // Vertical clamping / flipping
  if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, posY - rect.height);
  }

  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - rect.width - VIEWPORT_MARGIN));
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - rect.height - VIEWPORT_MARGIN));

  floatingStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    minWidth: minWidthStyle.value,
    zIndex: '10050',
  };
};

const open = (eventOrPos: MouseEvent | ContextMenuPosition) => {
  let x = 0;
  let y = 0;
  if ('clientX' in eventOrPos) {
    x = eventOrPos.clientX;
    y = eventOrPos.clientY;
  } else {
    x = eventOrPos.x;
    y = eventOrPos.y;
  }

  internalPosition.value = { x, y };
  if (!isControlled.value) {
    internalIsOpen.value = true;
  }
  emit('update:isOpen', true);
  emit('open', { x, y });
  void adjustPosition();
};

const close = () => {
  if (!isControlled.value) {
    internalIsOpen.value = false;
  }
  emit('update:isOpen', false);
  emit('close');
};

const handleItemSelect = (item: ContextMenuItemOption) => {
  if (item.disabled) return;
  emit('select', item.id);
  if (props.closeOnSelect) {
    close();
  }
};

const handleOutsideInteraction = (event: Event) => {
  if (!activeIsOpen.value) return;
  const target = event.target as Element | null;
  if (menuRef.value && menuRef.value.contains(target)) {
    return;
  }
  close();
};

const handleKeydown = (event: KeyboardEvent) => {
  if (activeIsOpen.value && event.key === 'Escape') {
    close();
  }
};

const handleBlur = () => {
  if (props.closeOnWindowBlur && activeIsOpen.value) {
    close();
  }
};

watch(
  () => [props.isOpen, props.x, props.y],
  () => {
    if (activeIsOpen.value) {
      void adjustPosition();
    }
  },
);

watch(activeIsOpen, (openVal) => {
  if (openVal) {
    window.requestAnimationFrame(() => void adjustPosition());
  }
});

onMounted(() => {
  window.addEventListener('pointerdown', handleOutsideInteraction, true);
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('resize', adjustPosition);
  window.addEventListener('scroll', adjustPosition, true);
});

onUnmounted(() => {
  window.removeEventListener('pointerdown', handleOutsideInteraction, true);
  window.removeEventListener('keydown', handleKeydown, true);
  window.removeEventListener('blur', handleBlur);
  window.removeEventListener('resize', adjustPosition);
  window.removeEventListener('scroll', adjustPosition, true);
});

defineExpose({
  open,
  close,
  isOpen: activeIsOpen,
});
</script>

<template>
  <slot name="trigger" :open="open" />

  <Teleport to="body">
    <Transition name="context-menu-pop">
      <div
        v-if="activeIsOpen"
        ref="menuRef"
        class="context-menu-surface"
        :style="floatingStyle"
        role="menu"
        tabindex="-1"
      >
        <slot :close="close">
          <template v-if="renderedItems.length">
            <template v-for="entry in renderedItems" :key="entry.key">
              <ContextMenuDivider v-if="entry.type === 'divider'" />
              <ContextMenuItem
                v-else
                :label="entry.item.label"
                :icon="entry.item.icon"
                :shortcut="entry.item.shortcut"
                :disabled="entry.item.disabled"
                :danger="entry.item.danger"
                :active="entry.item.active"
                @click="handleItemSelect(entry.item)"
              />
            </template>
          </template>
        </slot>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu-surface {
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-element, #1c1c1f);
  color: var(--text-primary);
  border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5));
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
  user-select: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.context-menu-pop-enter-active,
.context-menu-pop-leave-active {
  transition:
    opacity 0.12s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}

.context-menu-pop-enter-from,
.context-menu-pop-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
