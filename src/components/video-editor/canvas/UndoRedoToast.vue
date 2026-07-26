<script setup lang="ts">
import { ref, watch } from 'vue'
import { Undo2, Redo2 } from '@lucide/vue'
import type { HistoryAction } from '../composables/useEditorUndoRedo'

const props = defineProps<{
  action: HistoryAction | null
}>()

const isVisible = ref(false)
const currentAction = ref<HistoryAction | null>(null)
const animationKey = ref(0)
let dismissTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.action,
  (newAction) => {
    if (!newAction) return
    currentAction.value = newAction
    animationKey.value++
    isVisible.value = true

    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(() => {
      isVisible.value = false
    }, 1500)
  },
  { deep: true },
)
</script>

<template>
  <Transition name="undo-redo-toast">
    <div
      v-if="isVisible && currentAction"
      :key="animationKey"
      class="undo-redo-toast"
      role="status"
      aria-live="polite"
    >
      <Undo2 v-if="currentAction.type === 'undo'" class="toast-icon" :size="15" />
      <Redo2 v-else class="toast-icon" :size="15" />
      <span class="toast-text">
        {{ currentAction.type === 'undo' ? 'Undo' : 'Redo' }}
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.undo-redo-toast {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 50;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(18, 18, 22, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--color-border-dark, rgba(255, 255, 255, 0.14));
  border-radius: var(--radius-full, 9999px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), var(--shadow-md);
  color: var(--text-primary, #ffffff);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
  user-select: none;
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
</style>
