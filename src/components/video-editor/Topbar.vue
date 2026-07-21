<script setup lang="ts">
const { exportRequest } = defineProps<{ exportRequest?: any }>();
import { capture } from '../../api/capture'

import VideoProjectEdition from './VideoProjectEdition.vue'
import ExportPopover from '../export/ExportPopover.vue'
import Button from '~/ui/button/Button.vue'
import { ArrowLeft, Minus, X } from '@lucide/vue'

const emit = defineEmits<{
  (e: 'back-to-hud'): void
  (e: 'open-project', project: any): void
}>()

const handleExit = () => {
  emit('back-to-hud')
}

const minimizeApp = () => {
  capture.minimize()
}

const closeApp = () => {
  capture.close()
}

const onMouseDown = (mouseDownEvent: MouseEvent) => {
  if (mouseDownEvent.button !== 0) return

  const target = mouseDownEvent.target as HTMLElement
  if (
    target.closest('.left-actions') ||
    target.closest('.right-actions') ||
    target.closest('button') ||
    target.closest('a')
  ) {
    return
  }

  const startX = mouseDownEvent.screenX
  const startY = mouseDownEvent.screenY
  let isDragging = false

  const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
    if (!isDragging) {
      const deltaX = mouseMoveEvent.screenX - startX
      const deltaY = mouseMoveEvent.screenY - startY
      // 3px drag threshold/hysteresis to ensure double click doesn't trigger dragStart
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        isDragging = true
        capture.dragStart()
      }
    }

    if (isDragging) {
      capture.drag()
    }
  }

  const handleMouseUp = () => {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}
</script>

<template>
  <header
    class="editor-titlebar"
    @mousedown="onMouseDown"
    @dblclick="capture.toggleMaximize()"
  >
    <div class="left-actions" @dblclick.stop>
      <Button
        variant="ghost"
        size="sm"
        :icon="ArrowLeft"
        @click.stop="handleExit"
        class="exit-btn titlebar-btn"
      >
        Exit to HUD
      </Button>
      <VideoProjectEdition
        @open-project="emit('open-project', $event)"
      />
    </div>

    <div class="right-actions" @dblclick.stop>
      <ExportPopover v-if="exportRequest" :request="exportRequest" />
      <div class="window-controls">
        <button
          aria-label="Minimize"
          class="titlebar-btn control-btn"
          @click.stop="minimizeApp"
        >
          <Minus class="btn-icon" />
        </button>
        <button
          aria-label="Close"
          class="titlebar-btn control-btn close-btn"
          @click.stop="closeApp"
        >
          <X class="btn-icon" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.editor-titlebar {
  height: 40px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  flex-shrink: 0;
}

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
}

.left-actions {
  gap: 8px;
}

.exit-btn {
  margin-right: 4px;
}

.window-controls {
  display: flex;
  height: 100%;
  align-items: stretch;
}
</style>
