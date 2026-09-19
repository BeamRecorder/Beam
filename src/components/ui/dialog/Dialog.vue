<script setup lang="ts">
import { useTranslate } from '~/i18n/useTranslate';
import { inject, ref, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { X } from '@lucide/vue';

const { t } = useTranslate('Dialog');
const popoverOwner = inject<string | null>('popover-owner-id', null);
const content = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;
const focusable = () =>
  Array.from(
    content.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    ) ?? [],
  );
const restoreFocus = () => {
  if (previousFocus?.isConnected && !previousFocus.matches(':disabled')) previousFocus.focus();
  previousFocus = null;
};

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    closeOnOverlayClick?: boolean;
  }>(),
  {
    title: '',
    size: 'md',
    closeOnOverlayClick: true,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const close = () => {
  emit('close');
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Tab' && props.isOpen) {
    const nodes = focusable();
    const first = nodes[0],
      last = nodes.at(-1);
    if (
      !content.value?.contains(document.activeElement) ||
      !first ||
      (event.shiftKey && document.activeElement === first) ||
      (!event.shiftKey && document.activeElement === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? (last ?? content.value) : (first ?? content.value))?.focus();
    }
  }
  if (event.key === 'Escape' && props.isOpen) {
    event.preventDefault();
    close();
  }
};

watch(
  () => props.isOpen,
  async (newVal) => {
    if (typeof document === 'undefined') return;
    if (newVal) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.style.overflow = 'hidden';
      await nextTick();
      if (props.isOpen && !content.value?.contains(document.activeElement))
        (content.value?.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? content.value)?.focus();
    } else {
      document.body.style.overflow = '';
      restoreFocus();
    }
  },
  { immediate: true, flush: 'post' },
);

let mousedownTarget: EventTarget | null = null;

const handleOverlayMouseDown = (event: MouseEvent) => {
  mousedownTarget = event.target;
};

const handleOverlayMouseUp = (event: MouseEvent) => {
  if (props.closeOnOverlayClick && mousedownTarget === event.currentTarget && event.target === event.currentTarget) {
    close();
  }
  mousedownTarget = null;
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  document.body.style.overflow = '';
  restoreFocus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-overlay">
      <div
        v-if="isOpen"
        class="dialog-overlay"
        :data-popover-owner="popoverOwner"
        @mousedown="handleOverlayMouseDown"
        @mouseup="handleOverlayMouseUp"
      >
        <Transition name="scale-modal" appear>
          <div
            ref="content"
            tabindex="-1"
            class="dialog-content"
            :class="size"
            @mousedown.stop
            @mouseup.stop
            role="dialog"
            aria-modal="true"
          >
            <header class="dialog-header">
              <h3 v-if="title" class="dialog-title">{{ title }}</h3>
              <button type="button" class="dialog-close" @click="close" :aria-label="t('close')">
                <X class="close-icon" />
              </button>
            </header>

            <div class="dialog-body">
              <slot />
            </div>

            <footer v-if="$slots.footer" class="dialog-footer">
              <slot name="footer" :close="close" />
            </footer>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
  padding: 1rem;
}

.dialog-content {
  background-color: var(--color-bg-element);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  width: 100%;
  overflow: hidden;
  position: relative;
}

/* Sizes */
.dialog-content.sm {
  max-width: 440px;
}
.dialog-content.md {
  max-width: 560px;
}
.dialog-content.lg {
  max-width: 800px;
}
.dialog-content.xl {
  max-width: 1140px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.dialog-title {
  font-family: var(--font-headline);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.dialog-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--color-primary);
}

.close-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.dialog-body {
  padding: 1.5rem;
  overflow-y: auto;
  font-size: 1rem;
  color: var(--text-secondary);
}

.dialog-footer {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background-color: var(--color-bg-surface);
}

/* Overlay Fade Transition */
.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.25s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

/* Modal Scale Transition */
.scale-modal-enter-active {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.25s ease;
}
.scale-modal-leave-active {
  transition:
    transform 0.2s ease-in,
    opacity 0.15s ease-in;
}

.scale-modal-enter-from,
.scale-modal-leave-to {
  transform: scale(0.95);
  opacity: 0;
}

.scale-modal-enter-to,
.scale-modal-leave-from {
  transform: scale(1);
  opacity: 1;
}
</style>
