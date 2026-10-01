<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';
import { Undo2, Redo2 } from '@lucide/vue';
import type { HistoryAction } from '../composables/useEditorUndoRedo';
import { useTranslate } from '~/i18n/useTranslate';
import { describeHistoryAction } from '../composables/history-description';

const { t } = useTranslate('UndoRedoToast');

const props = defineProps<{
  action: HistoryAction | null;
}>();

const isVisible = ref(false);
const currentAction = shallowRef<HistoryAction | null>(null);
const animationKey = ref(0);
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
const change = computed(() => currentAction.value && describeHistoryAction(currentAction.value));
const message = computed(() => {
  const action = currentAction.value;
  if (!action) return '';
  const description = change.value;
  if (!description) return t(action.type);
  const kind = t(`targets.${description.target}`);
  const name = description.name?.trim();
  const item = description.count
    ? t('items', { count: description.count })
    : name
      ? t('namedItem', { kind, name })
      : kind;
  return t(`${action.type}Action`, {
    action: t('action', { operation: t(`operations.${description.operation}`), item }),
  });
});

watch(
  () => props.action,
  (newAction) => {
    if (dismissTimer) clearTimeout(dismissTimer);
    if (!newAction) {
      isVisible.value = false;
      currentAction.value = null;
      return;
    }
    currentAction.value = newAction;
    animationKey.value++;
    isVisible.value = true;

    dismissTimer = setTimeout(() => {
      isVisible.value = false;
    }, 1500);
  },
  { immediate: true },
);
onUnmounted(() => {
  if (dismissTimer) clearTimeout(dismissTimer);
});
</script>

<template>
  <Transition name="undo-redo-toast">
    <div v-if="isVisible && currentAction" :key="animationKey" class="undo-redo-toast" role="status" aria-live="polite">
      <Undo2 v-if="currentAction.type === 'undo'" class="toast-icon" :size="15" />
      <Redo2 v-else class="toast-icon" :size="15" />
      <span class="toast-text">
        {{ message }}
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.undo-redo-toast {
  position: absolute;
  bottom: 24px;
  right: 24px;
  z-index: 50;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--color-bg-element);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full, 9999px);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
  user-select: none;
  max-width: calc(100% - 48px);
  box-sizing: border-box;
}

.toast-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toast-icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.undo-redo-toast-enter-active {
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.undo-redo-toast-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}

.undo-redo-toast-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.92);
}

.undo-redo-toast-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .undo-redo-toast-enter-active,
  .undo-redo-toast-leave-active {
    transition: none;
  }
}
</style>
