<script setup lang="ts">
import { inject, nextTick, provide, ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { popoverViewportKey, popoverAnchorConstraintKey } from './popover-viewport-types';
import { holdPopoverInteractionKey, popoverOpenStateKey, popoverVisibilityKey } from './popover-interaction-types';

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
    disabled?: boolean;
    allowOverflow?: boolean;
    surface?: 'default' | 'attached';
    gap?: number;
    keepMounted?: boolean;
    motion?: 'default' | 'lift';
    triggerOn?: 'click' | 'pointerdown';
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
    disabled: false,
    allowOverflow: false,
    surface: 'default',
    gap: 8,
    keepMounted: false,
    motion: 'default',
    triggerOn: 'click',
  },
);

const emit = defineEmits<{
  (e: 'toggle', isOpen: boolean): void;
}>();

const isOpen = ref(false);
const hasOpened = ref(false);
const notifyOpenState = inject(popoverOpenStateKey, null);
const parentVisibility = inject(popoverVisibilityKey, null);
provide(popoverVisibilityKey, isOpen);
const popoverRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const directionClass = ref(props.direction);
const floatingStyle = ref<Record<string, string>>({});
const liftStartStyle = ref<Record<string, string>>({});
const pinned = ref(false);
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let gestureResetTimer: ReturnType<typeof setTimeout> | null = null;
let gestureStartedInsidePopover = false;
const VIEWPORT_MARGIN = 8;
const parentPopoverId = inject<string | null>('popover-owner-id', null);
const resizeViewport = inject(popoverViewportKey, null);
const fitAnchor = inject(popoverAnchorConstraintKey, false);
const popoverId = `popover-${Math.random().toString(36).slice(2)}`;
provide('popover-owner-id', popoverId);
const holdParentInteraction = inject(holdPopoverInteractionKey, null);
let externalInteractions = 0;
provide(holdPopoverInteractionKey, () => {
  const releaseParent = holdParentInteraction?.();
  externalInteractions++;
  cancelClose();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    externalInteractions--;
    releaseParent?.();
  };
});

const toggle = () => {
  if (props.disabled) return;
  if (props.interaction === 'hover-focus-click') {
    pinned.value = !pinned.value;
    isOpen.value = pinned.value || isOpen.value;
    if (!pinned.value) isOpen.value = false;
    return;
  }
  isOpen.value = !isOpen.value;
};
const handleTriggerPress = (event: PointerEvent) => {
  if (props.triggerOn !== 'pointerdown' || event.button !== 0 || event.ctrlKey) return;
  event.preventDefault();
  toggle();
};
const handleTriggerClick = (event: MouseEvent) => {
  if (props.triggerOn === 'pointerdown' && event.detail > 0) return;
  toggle();
};

const close = () => {
  pinned.value = false;
  isOpen.value = false;
};
if (parentVisibility)
  watch(parentVisibility, (visible) => {
    if (!visible) close();
  });
const cancelClose = () => {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
};
const openTransient = () => {
  if (props.disabled || props.interaction !== 'hover-focus-click') return;
  cancelClose();
  isOpen.value = true;
};
const scheduleClose = () => {
  if (externalInteractions || props.interaction !== 'hover-focus-click' || pinned.value) return;
  cancelClose();
  closeTimer = setTimeout(() => {
    const active = document.activeElement;
    if ((popoverRef.value?.contains(active) || contentRef.value?.contains(active)) ?? false) return;
    isOpen.value = false;
  }, props.closeDelay);
};
const scheduleFocusClose = () => {
  if (externalInteractions || props.interaction !== 'hover-focus-click') return;
  cancelClose();
  closeTimer = setTimeout(() => {
    const active = document.activeElement;
    if ((popoverRef.value?.contains(active) || contentRef.value?.contains(active)) ?? false) return;
    close();
  }, props.closeDelay);
};

const adjustPosition = async () => {
  await nextTick();
  if (!popoverRef.value || !contentRef.value || !isOpen.value) return;
  const triggerEl = popoverRef.value.querySelector('.popover-trigger') || popoverRef.value;
  const rect = triggerEl.getBoundingClientRect();
  if (resizeViewport && props.direction === 'down') {
    const height = Math.max(contentRef.value.scrollHeight, contentRef.value.getBoundingClientRect().height);
    await resizeViewport(popoverId, rect.bottom + props.gap + height);
    await nextTick();
    if (!contentRef.value || !isOpen.value) return;
  }
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

  const availableHeight = Math.max(0, directionClass.value === 'down' ? spaceBelow : spaceAbove);
  const fittedHeight = fitAnchor ? Math.min(content.height, availableHeight) : content.height;
  const top = directionClass.value === 'down' ? rect.bottom + props.gap : rect.top - fittedHeight - props.gap;
  let left = rect.left;

  if (props.align === 'left') {
    left = rect.left;
  } else if (props.align === 'right') {
    left = rect.right - content.width;
  } else {
    left = rect.left + rect.width / 2 - content.width / 2;
  }
  const clampedLeft = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - content.width - VIEWPORT_MARGIN));
  const clampedTop = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - fittedHeight - VIEWPORT_MARGIN));
  floatingStyle.value = {
    position: 'fixed',
    visibility: 'visible',
    top: `${clampedTop}px`,
    left: `${clampedLeft}px`,
    zIndex: '10000',
    ...(fitAnchor
      ? {
          '--popover-available-height': `${Math.max(0, availableHeight - 10)}px`,
        }
      : {}),
    ...(props.allowOverflow
      ? {}
      : {
          maxHeight: fitAnchor ? `${availableHeight}px` : `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
          overflowY: 'auto',
        }),
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
  notifyOpenState?.(popoverId, val);
  if (props.motion === 'lift') {
    const content = contentRef.value;
    const interrupted =
      content &&
      (content.classList.contains('pop-lift-enter-active') || content.classList.contains('pop-lift-leave-active'));
    const style = interrupted ? window.getComputedStyle(content) : null;
    liftStartStyle.value = {
      '--popover-lift-opacity': style?.opacity || (val ? '0.16' : '1'),
      '--popover-lift-transform': style?.transform || `translate3d(0, ${val ? 6 : 0}px, 0)`,
    };
  }
  if (val) {
    hasOpened.value = true;
    // Prevent teleported content from painting at its unpositioned origin.
    // This is most noticeable for Selects nested inside another popover.
    const trigger = popoverRef.value?.querySelector('.popover-trigger')?.getBoundingClientRect();
    floatingStyle.value = {
      position: 'fixed',
      visibility: 'hidden',
      top: `${VIEWPORT_MARGIN}px`,
      left: `${VIEWPORT_MARGIN}px`,
      maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
      overflowY: 'auto',
      ...(props.matchTriggerWidth && trigger ? { width: `${Math.min(trigger.width, window.innerWidth - 16)}px` } : {}),
    };
    void nextTick(() => adjustPosition());
    void nextTick(() => {
      if (contentRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver(() => void adjustPosition());
        resizeObserver.observe(contentRef.value);
      }
    });
  } else {
    void resizeViewport?.(popoverId, null);
    resizeObserver?.disconnect();
    resizeObserver = null;
  }
  emit('toggle', val);
});

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  },
);
watch(
  () => props.direction,
  (val) => {
    directionClass.value = val;
  },
);

const repositionOpenPopover = () => {
  if (isOpen.value) void adjustPosition();
};
watch(() => props.gap, repositionOpenPopover);
const closeOnWindowBlur = () => {
  if (props.closeOnWindowBlur && !externalInteractions) close();
};

const isClickInsideThisOrChildPopover = (target: Element | null) => {
  if (!target) return false;
  if (popoverRef.value && popoverRef.value.contains(target)) return true;
  if (contentRef.value && contentRef.value.contains(target)) return true;
  const targetOwnerId = target.closest('[data-popover-owner]')?.getAttribute('data-popover-owner');
  if (targetOwnerId === popoverId) return true;
  return false;
};

const handleInteractionStart = (event: Event) => {
  const target = event.target as Element | null;
  gestureStartedInsidePopover = isClickInsideThisOrChildPopover(target);
  handleOutsideInteraction(event);
};

const scheduleGestureReset = () => {
  if (gestureResetTimer) clearTimeout(gestureResetTimer);
  // The release can dispatch a click on the shared ancestor outside the panel.
  gestureResetTimer = setTimeout(() => {
    gestureStartedInsidePopover = false;
    gestureResetTimer = null;
  });
};

const handleOutsideInteraction = (event: Event) => {
  if (!isOpen.value || externalInteractions) return;
  const target = event.target as Element | null;
  if (isClickInsideThisOrChildPopover(target)) return;
  if (event.type === 'click' && gestureStartedInsidePopover) {
    gestureStartedInsidePopover = false;
    return;
  }
  close();
};
const handleEscape = (event: KeyboardEvent) => {
  if (!externalInteractions && props.interaction === 'hover-focus-click' && event.key === 'Escape' && isOpen.value)
    close();
};

onMounted(() => {
  window.addEventListener('pointerdown', handleInteractionStart, true);
  window.addEventListener('mousedown', handleInteractionStart, true);
  window.addEventListener('pointerup', scheduleGestureReset, true);
  window.addEventListener('mouseup', scheduleGestureReset, true);
  window.addEventListener('pointercancel', scheduleGestureReset, true);
  window.addEventListener('click', handleOutsideInteraction, true);
  window.addEventListener('resize', repositionOpenPopover);
  window.addEventListener('scroll', repositionOpenPopover, true);
  window.addEventListener('blur', closeOnWindowBlur);
  document.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  notifyOpenState?.(popoverId, false);
  void resizeViewport?.(popoverId, null);
  if (isOpen.value) emit('toggle', false);
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('pointerdown', handleInteractionStart, true);
  window.removeEventListener('mousedown', handleInteractionStart, true);
  window.removeEventListener('pointerup', scheduleGestureReset, true);
  window.removeEventListener('mouseup', scheduleGestureReset, true);
  window.removeEventListener('pointercancel', scheduleGestureReset, true);
  window.removeEventListener('click', handleOutsideInteraction, true);
  window.removeEventListener('resize', repositionOpenPopover);
  window.removeEventListener('scroll', repositionOpenPopover, true);
  window.removeEventListener('blur', closeOnWindowBlur);
  document.removeEventListener('keydown', handleEscape);
  cancelClose();
  if (gestureResetTimer) clearTimeout(gestureResetTimer);
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
      @pointerdown="handleTriggerPress"
      @click.stop="handleTriggerClick"
      @mouseenter="openTransient"
      @mouseleave="scheduleClose"
      @focusin="openTransient"
      @focusout="scheduleFocusClose"
    >
      <slot name="trigger" :isOpen="isOpen" />
    </div>

    <Teleport to="body">
      <Transition :name="motion === 'lift' ? 'pop-lift' : 'pop'">
        <div
          v-if="isOpen || (keepMounted && hasOpened)"
          v-show="isOpen"
          ref="contentRef"
          class="popover-content"
          :data-popover-id="popoverId"
          :inert="!isOpen || undefined"
          :data-popover-owner="parentPopoverId"
          :class="[
            align,
            directionClass,
            { 'popover-attached': surface === 'attached' },
            {
              'popover-block': block,
              'popover-flush': flush,
              'popover-allow-overflow': allowOverflow,
            },
          ]"
          :style="[floatingStyle, liftStartStyle]"
          @mouseenter="cancelClose"
          @mouseleave="scheduleClose"
          @focusin="cancelClose"
          @focusout="scheduleFocusClose"
        >
          <slot :close="close" :isOpen="isOpen" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped src="./popover.css"></style>
