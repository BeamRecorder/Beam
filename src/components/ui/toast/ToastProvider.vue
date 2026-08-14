<script setup lang="ts">
import { useToastStore } from './toastStore';
import { X, CheckCircle, AlertCircle, Copy, Info } from '@lucide/vue';
import Button from '../button/Button.vue';
import type { Toast } from './toastStore';

const toastStore = useToastStore();
const handleToastAction = (toast: Toast) => {
  toast.action?.onClick();
  toastStore.remove(toast.id);
};
</script>

<template>
  <div class="toast-container" aria-live="assertive">
    <TransitionGroup name="toast-list">
      <div v-for="toast in toastStore.toasts" :key="toast.id" class="toast-item" :class="toast.type">
        <span class="toast-icon-wrapper">
          <CheckCircle v-if="toast.type === 'success'" class="toast-icon success" />
          <AlertCircle v-else-if="toast.type === 'error'" class="toast-icon error" />
          <AlertCircle v-else-if="toast.type === 'warning'" class="toast-icon warning" />
          <Info v-else class="toast-icon info" />
        </span>

        <span class="toast-message">{{ toast.message }}</span>

        <Button
          v-if="toast.action"
          variant="secondary"
          size="sm"
          class="toast-action-btn"
          :aria-label="toast.action.label"
          :tooltip="toast.type === 'error' ? toast.action.label : ''"
          @click="handleToastAction(toast)"
        >
          <Copy v-if="toast.type === 'error'" :size="15" aria-hidden="true" />
          <template v-else>{{ toast.action.label }}</template>
        </Button>

        <button type="button" class="toast-close" @click="toastStore.remove(toast.id)" aria-label="Dismiss toast">
          <X class="close-icon" />
        </button>
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
  background-color: white;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Accent border/decorations */
.toast-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.toast-item.success::before {
  background-color: var(--color-success);
}
.toast-item.error::before {
  background-color: var(--color-error);
}
.toast-item.warning::before {
  background-color: var(--color-warning);
}
.toast-item.info::before {
  background-color: var(--color-info);
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

.toast-message {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-primary);
  flex-grow: 1;
  line-height: 1.4;
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
</style>
