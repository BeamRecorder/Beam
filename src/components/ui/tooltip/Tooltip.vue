<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    content?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    variant?: 'default' | 'error';
    disabled?: boolean;
    maxWidth?: number;
    delay?: number;
    as?: string;
  }>(),
  {
    position: 'top',
    variant: 'default',
    delay: 0,
    as: 'div',
  },
);

const visible = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const tooltipStyle = ref<Record<string, string>>({});
const resolvedPosition = ref<'top' | 'bottom' | 'left' | 'right'>(props.position);
let showTimer: ReturnType<typeof setTimeout> | null = null;

const updatePosition = () => {
  const wrapper = wrapperRef.value;
  const tooltip = contentRef.value;
  if (!wrapper || !tooltip) return;
  const rect = wrapper.getBoundingClientRect();
  const offset = 8;
  const margin = 0;
  const { width, height } = tooltip.getBoundingClientRect();
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;
  const preferred = props.position ?? 'top';
  const candidates: Array<'top' | 'bottom' | 'left' | 'right'> = [
    preferred,
    opposite[preferred],
    'right',
    'left',
    'bottom',
    'top',
  ].filter((item, index, values) => values.indexOf(item) === index) as Array<'top' | 'bottom' | 'left' | 'right'>;
  const point = (side: (typeof candidates)[number]) => {
    if (side === 'bottom') return { top: rect.bottom + offset, left: rect.left + (rect.width - width) / 2 };
    if (side === 'left') return { top: rect.top + (rect.height - height) / 2, left: rect.left - offset - width };
    if (side === 'right') return { top: rect.top + (rect.height - height) / 2, left: rect.right + offset };
    return { top: rect.top - offset - height, left: rect.left + (rect.width - width) / 2 };
  };
  const fits = ({ top, left }: { top: number; left: number }) =>
    top >= margin &&
    left >= margin &&
    top + height <= window.innerHeight - margin &&
    left + width <= window.innerWidth - margin;
  const side = candidates.find((candidate) => fits(point(candidate))) ?? preferred;
  const next = point(side);
  resolvedPosition.value = side;
  tooltipStyle.value = {
    top: `${Math.min(Math.max(next.top, margin), window.innerHeight - height - margin)}px`,
    left: `${Math.min(Math.max(next.left, margin), window.innerWidth - width - margin)}px`,
  };
};

const show = () => {
  if (props.disabled) return;
  if (showTimer) clearTimeout(showTimer);
  const delayMs = props.delay ?? 100;
  if (delayMs > 0) {
    showTimer = setTimeout(async () => {
      visible.value = true;
      await nextTick();
      updatePosition();
    }, delayMs);
  } else {
    visible.value = true;
    void nextTick().then(updatePosition);
  }
};

const hide = () => {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  visible.value = false;
};

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) return hide();
    if (wrapperRef.value?.matches(':hover')) void show();
  },
);
watch(
  () => props.position,
  () => {
    if (visible.value) updatePosition();
  },
);

window.addEventListener('resize', updatePosition);
window.addEventListener('scroll', updatePosition, true);
onBeforeUnmount(() => {
  if (showTimer) clearTimeout(showTimer);
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
});
</script>

<template>
  <component
    :is="as || 'div'"
    ref="wrapperRef"
    v-bind="$attrs"
    :class="['tooltip-wrapper', ($attrs as any)?.class]"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
  >
    <slot />
  </component>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible && (content || $slots.content)"
        ref="contentRef"
        class="tooltip-content"
        :class="[resolvedPosition, `tooltip-${variant}`]"
        :style="{ ...tooltipStyle, ...(maxWidth ? { maxWidth: `${maxWidth}px` } : {}) }"
        role="tooltip"
      >
        <slot name="content">{{ content }}</slot>
        <div class="tooltip-arrow" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-block;
}

.tooltip-content {
  position: fixed;
  box-sizing: border-box;
  background-color: color-mix(in srgb, var(--color-bg-surface) 92%, transparent);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  color: var(--text-primary);
  border: 1px solid color-mix(in srgb, var(--color-border) 80%, rgba(255, 255, 255, 0.18));
  padding: 5px 9px;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  font-weight: 600;
  max-width: min(260px, calc(100vw - 24px));
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
  line-height: 1.35;
  z-index: 20000;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.35),
    0 2px 6px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.tooltip-content.tooltip-error {
  background-color: var(--color-error);
  border-color: var(--color-error);
  color: #ffffff;
}
.tooltip-content.tooltip-error.top .tooltip-arrow {
  border-color: var(--color-error) transparent transparent transparent;
}
.tooltip-content.tooltip-error.bottom .tooltip-arrow {
  border-color: transparent transparent var(--color-error) transparent;
}
.tooltip-content.tooltip-error.left .tooltip-arrow {
  border-color: transparent transparent transparent var(--color-error);
}
.tooltip-content.tooltip-error.right .tooltip-arrow {
  border-color: transparent var(--color-error) transparent transparent;
}

/* Arrow placement & styles */
.tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

/* Top positioning */
.tooltip-content.top .tooltip-arrow {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px 5px 0 5px;
  border-color: var(--color-bg-surface) transparent transparent transparent;
}

/* Bottom positioning */
.tooltip-content.bottom .tooltip-arrow {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 0 5px 5px 5px;
  border-color: transparent transparent var(--color-bg-surface) transparent;
}

/* Left positioning */
.tooltip-content.left .tooltip-arrow {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-width: 5px 0 5px 5px;
  border-color: transparent transparent transparent var(--color-bg-surface);
}

/* Right positioning */
.tooltip-content.right .tooltip-arrow {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-width: 5px 5px 5px 0;
  border-color: transparent var(--color-bg-surface) transparent transparent;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
