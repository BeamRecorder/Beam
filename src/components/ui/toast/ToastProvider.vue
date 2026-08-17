<script setup lang="ts">
import { useToastStore } from './toastStore';
import { X, CheckCircle, AlertCircle, ClipboardPaste, Copy, Info } from '@lucide/vue';
import Button from '../button/Button.vue';
import CopyButton from '../button/CopyButton.vue';
import type { Toast } from './toastStore';

const toastStore = useToastStore();
const reportCopyError = (error: Error) => {
  console.error('Unable to copy toast details.', error);
};

const handleToastAction = async (toast: Toast) => {
  if (!toast.action?.onClick) return;
  try {
    await toast.action.onClick();
    if (toast.action.dismissOnSuccess !== false) toastStore.remove(toast.id);
  } catch (error) {
    console.error('Unable to complete toast action.', error);
  }
};
</script>

<template>
  <div class="toast-container" aria-live="assertive">
    <TransitionGroup name="toast-list">
      <div v-for="toast in toastStore.toasts" :key="toast.id" class="toast-item" :class="toast.type">
        <span class="toast-icon-wrapper" aria-hidden="true">
          <span
            v-if="toast.type === 'success' && toast.leadingIcon"
            :key="`${toast.id}-${toast.revision}`"
            class="toast-icon-morph success"
          >
            <Copy v-if="toast.leadingIcon === 'copy'" class="toast-icon toast-icon-source" />
            <ClipboardPaste v-else class="toast-icon toast-icon-source" />
            <CheckCircle class="toast-icon toast-icon-confirmed" />
          </span>
          <CheckCircle v-else-if="toast.type === 'success'" class="toast-icon success" />
          <AlertCircle v-else-if="toast.type === 'error'" class="toast-icon error" />
          <AlertCircle v-else-if="toast.type === 'warning'" class="toast-icon warning" />
          <Info v-else class="toast-icon info" />
        </span>

        <span class="toast-content">
          <span class="toast-message">
            {{ toast.message }}
            <span v-if="toast.count > 1" class="toast-count">×{{ toast.count }}</span>
          </span>
          <code v-if="toast.action?.detail" class="toast-detail">{{ toast.action.detail }}</code>
        </span>

        <CopyButton
          v-if="toast.action?.copyText"
          :text="toast.action.copyText"
          display="icon"
          variant="secondary"
          size="sm"
          class="toast-action-btn"
          :label="toast.action.label"
          :copied-label="toast.action.copiedLabel"
          :error-label="toast.action.errorLabel"
          @copied="toast.action.dismissOnSuccess === true && toastStore.remove(toast.id)"
          @error="reportCopyError"
        />

        <Button
          v-else-if="toast.action"
          variant="secondary"
          size="sm"
          class="toast-action-btn"
          :aria-label="toast.action.label"
          @click="handleToastAction(toast)"
        >
          {{ toast.action.label }}
        </Button>

        <button type="button" class="toast-close" @click="toastStore.remove(toast.id)" aria-label="Dismiss toast">
          <X class="close-icon" />
        </button>

        <span
          v-if="toast.duration > 0"
          :key="`progress-${toast.id}-${toast.revision}`"
          class="toast-progress"
          :style="{ '--toast-duration': `${toast.duration}ms` }"
          aria-hidden="true"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 2000;
  max-width: 400px;
  width: calc(100vw - 48px);
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background-color: var(--color-bg-element);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toast-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.toast-icon.success {
  color: var(--color-success);
}
.toast-icon.error {
  color: var(--color-error);
}
.toast-icon.warning {
  color: var(--color-warning);
}
.toast-icon.info {
  color: var(--color-info);
}

.toast-icon-morph {
  position: relative;
  display: block;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-success);
}

.toast-icon-morph .toast-icon {
  position: absolute;
  inset: 0;
}

.toast-icon-source {
  animation: toast-icon-source 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.toast-icon-confirmed {
  opacity: 0;
  transform: scale(0.65) rotate(-10deg);
  animation: toast-icon-confirmed 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.toast-content {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.toast-message {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-count {
  display: inline-flex;
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: var(--color-bg-surface-hover);
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.toast-progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: currentColor;
  opacity: 0.55;
  transform-origin: left;
  animation: toast-progress var(--toast-duration) linear forwards;
}

.toast-item.success .toast-progress {
  color: var(--color-success);
}
.toast-item.error .toast-progress {
  color: var(--color-error);
}
.toast-item.warning .toast-progress {
  color: var(--color-warning);
}
.toast-item.info .toast-progress {
  color: var(--color-info);
}

.toast-detail {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  white-space: normal;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.35;
  user-select: text;
}

.toast-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: var(--radius-sm);
  transition: all 0.2s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-close:hover {
  background-color: var(--color-bg-surface-hover);
  color: var(--color-primary);
}

.close-icon {
  width: 1rem;
  height: 1rem;
}

/* List Transitions */
.toast-list-enter-from {
  opacity: 0;
  transform: translateX(50px) scale(0.9);
}
.toast-list-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.9);
}

.toast-list-leave-active {
  position: absolute;
}

@keyframes toast-icon-source {
  0%,
  42% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(0.65) rotate(10deg);
  }
}

@keyframes toast-icon-confirmed {
  0%,
  42% {
    opacity: 0;
    transform: scale(0.65) rotate(-10deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes toast-progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-item {
    transition: none;
  }

  .toast-list-enter-from,
  .toast-list-leave-to {
    transform: none;
  }

  .toast-icon-source,
  .toast-progress {
    display: none;
  }

  .toast-icon-confirmed {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
</style>
