<script setup lang="ts">
import { inject, nextTick, provide, ref, onMounted, onUnmounted, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    align?: 'left' | 'right' | 'center';
    direction?: 'up' | 'down';
    block?: boolean;
    matchTriggerWidth?: boolean;
    flush?: boolean;
    closeOnWindowBlur?: boolean;
    interaction?: 'click' | 'hover-focus-click';
    closeDelay?: number;
  }>(),
  {
    align: 'left',
    direction: 'down',
    block: false,
    matchTriggerWidth: true,
    flush: false,
    closeOnWindowBlur: true,
    interaction: 'click',
    closeDelay: 180,
  },
);

const emit = defineEmits<{
  (e: 'toggle', isOpen: boolean): void;
}>();

const isOpen = ref(false);
const popoverRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const directionClass = ref(props.direction);
const floatingStyle = ref<Record<string, string>>({});
const pinned = ref(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const VIEWPORT_MARGIN = 8;
const parentPopoverId = inject<string | null>('popover-owner-id', null);
const popoverId = `popover-${Math.random().toString(36).slice(2)}`;
provide('popover-owner-id', popoverId);

const toggle = () => {
  if (props.interaction === 'hover-focus-click') {
    pinned.value = !pinned.value;
    isOpen.value = pinned.value || isOpen.value;
    if (!pinned.value) isOpen.value = false;
    return;
  }
  isOpen.value = !isOpen.value;
};

const close = () => {
  pinned.value = false;
  isOpen.value = false;
};
const cancelClose = () => {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
};
const openTransient = () => {
  if (props.interaction !== 'hover-focus-click') return;
  cancelClose();
  isOpen.value = true;
};
const scheduleClose = () => {
  if (props.interaction !== 'hover-focus-click' || pinned.value) return;
  cancelClose();
  closeTimer = setTimeout(() => {
    const active = document.activeElement;
    if ((popoverRef.value?.contains(active) || contentRef.value?.contains(active)) ?? false) return;
    isOpen.value = false;
  }, props.closeDelay);
};
const scheduleFocusClose = () => {
  if (props.interaction !== 'hover-focus-click') return;
  cancelClose();
  closeTimer = setTimeout(() => {
    const active = document.activeElement;
    if ((popoverRef.value?.contains(active) || contentRef.value?.contains(active)) ?? false) return;
    close();
  }, props.closeDelay);
};

const adjustPosition = async () => {
  if (!popoverRef.value || !contentRef.value) return;
  const triggerEl = popoverRef.value.querySelector('.popover-trigger') || popoverRef.value;
  const rect = triggerEl.getBoundingClientRect();
  await nextTick();
  const content = contentRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - VIEWPORT_MARGIN;

  const requiredHeight = Math.max(content.height, 150);
  if (props.direction === 'down' && spaceBelow < requiredHeight && spaceAbove > spaceBelow) {
    directionClass.value = 'up';
  } else if (props.direction === 'up' && spaceAbove < requiredHeight && spaceBelow > spaceAbove) {
    directionClass.value = 'down';
  } else {
    directionClass.value = props.direction;
  }

  const top =
    directionClass.value === 'down' ? rect.bottom + VIEWPORT_MARGIN : rect.top - content.height - VIEWPORT_MARGIN;
  let left = rect.left;

  if (props.align === 'left') {
    left = rect.left;
  } else if (props.align === 'right') {
    left = rect.right - content.width;
  } else {
    left = rect.left + rect.width / 2 - content.width / 2;
  }
  const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - content.width - VIEWPORT_MARGIN));
  const clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - content.height - VIEWPORT_MARGIN));
  floatingStyle.value = {
    position: 'fixed',
    top: `${clampedTop}px`,
    left: `${clampedLeft}px`,
    zIndex: '10000',
    maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
    overflowY: 'auto',
    ...(props.matchTriggerWidth
      ? {
          width: `${Math.min(rect.width, window.innerWidth - 16)}px`,
          maxWidth: 'calc(100vw - 16px)',
        }
      : {}),
  };
};

let resizeObserver: ResizeObserver | null = null;

watch(isOpen, (val) => {
  if (val) {
    window.requestAnimationFrame(() => void adjustPosition());
    void nextTick(() => {
      if (contentRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => void adjustPosition());
        resizeObserver.observe(contentRef.value);
      }
    });
  } else {
    resizeObserver?.disconnect();
    resizeObserver = null;
  }
  emit('toggle', val);
});

watch(
  () => props.direction,
  (val) => {
    directionClass.value = val;
  },
);

const repositionOpenPopover = () => {
  if (isOpen.value) void adjustPosition();
};
const closeOnWindowBlur = () => {
  if (props.closeOnWindowBlur) close();
};

const isClickInsideThisOrChildPopover = (target: Element | null) => {
  if (!target) return false;
  if (popoverRef.value && popoverRef.value.contains(target)) return true;
  if (contentRef.value && contentRef.value.contains(target)) return true;
  const targetOwnerId = target.closest('[data-popover-owner]')?.getAttribute('data-popover-owner');
  if (targetOwnerId === popoverId) return true;
  return false;
};

const handleOutsideInteraction = (event: Event) => {
  if (!isOpen.value) return;
  const target = event.target as Element | null;
  if (!isClickInsideThisOrChildPopover(target)) {
    close();
  }
};
const handleEscape = (event: KeyboardEvent) => {
  if (props.interaction === 'hover-focus-click' && event.key === 'Escape' && isOpen.value) close();
};

onMounted(() => {
  window.addEventListener('pointerdown', handleOutsideInteraction, true);
  window.addEventListener('mousedown', handleOutsideInteraction, true);
  window.addEventListener('click', handleOutsideInteraction, true);
  window.addEventListener('resize', repositionOpenPopover);
  window.addEventListener('scroll', repositionOpenPopover, true);
  window.addEventListener('blur', closeOnWindowBlur);
  document.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('pointerdown', handleOutsideInteraction, true);
  window.removeEventListener('mousedown', handleOutsideInteraction, true);
  window.removeEventListener('click', handleOutsideInteraction, true);
  window.removeEventListener('resize', repositionOpenPopover);
  window.removeEventListener('scroll', repositionOpenPopover, true);
  window.removeEventListener('blur', closeOnWindowBlur);
  document.removeEventListener('keydown', handleEscape);
  cancelClose();
});

defineExpose({
  isOpen,
  toggle,
  close,
});
</script>

<template>
  <div :class="['popover-container', { 'popover-block': block }]" ref="popoverRef">
    <div
      :class="['popover-trigger', { 'popover-block': block }]"
      @click.stop="toggle"
      @mouseenter="openTransient"
      @mouseleave="scheduleClose"
      @focusin="openTransient"
      @focusout="scheduleFocusClose"
    >
      <slot name="trigger" :isOpen="isOpen" />
    </div>

    <Teleport to="body">
      <Transition name="pop">
        <div
          v-if="isOpen"
          ref="contentRef"
          class="popover-content"
          :data-popover-id="popoverId"
          :data-popover-owner="parentPopoverId"
          :class="[align, directionClass, { 'popover-block': block, 'popover-flush': flush }]"
          :style="floatingStyle"
          @mouseenter="cancelClose"
          @mouseleave="scheduleClose"
          @focusin="cancelClose"
          @focusout="scheduleFocusClose"
        >
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.popover-container {
  position: relative;
  display: inline-block;
}

.popover-container.popover-block {
  display: block;
  width: 100%;
}

.popover-trigger {
  display: inline-block;
  cursor: pointer;
}

.popover-trigger.popover-block {
  display: block;
  width: 100%;
}

.popover-content {
  position: absolute;
  background-color: var(--color-bg-element);
  color: var(--text-primary);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 4px 0;
  z-index: 50;
  box-sizing: border-box;
  overflow: hidden;
  width: fit-content;
  max-width: calc(100vw - 16px);
}

.popover-content.popover-block {
  min-width: 0;
}

.popover-content.popover-flush {
  padding: 0;
  background: var(--color-bg-surface);
}

/* Animations */
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.pop-enter-to,
.pop-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.pop-enter-active.center,
.pop-leave-active.center {
  transition:
    opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.pop-enter-from.center,
.pop-leave-to.center {
  opacity: 0;
  transform: translate(-50%, -4px);
}

.pop-enter-to.center,
.pop-leave-from.center {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
