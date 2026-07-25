<script setup lang="ts">
import { capture } from '../../api/capture'
import VideoProjectEdition from './VideoProjectEdition.vue'
import ExportPopover from '../export/ExportPopover.vue'
import Button from '~/ui/button/Button.vue'
import { ArrowLeft, Minus, X, Undo2, Redo2 } from '@lucide/vue'

withDefaults(
  defineProps<{
    exportRequest?: any;
    project?: any;
    isSaving?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    historyTooltipPosition?: "top" | "bottom" | "left" | "right";
  }>(),
  {
    exportRequest: null,
    project: null,
    isSaving: false,
    canUndo: false,
    canRedo: false,
    historyTooltipPosition: "bottom",
  },
);

const emit = defineEmits<{
  (e: 'back-to-hud'): void;
  (e: 'open-project', project: any): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
}>();

const handleExit = () => {
  emit('back-to-hud')
}

const minimizeApp = () => {
  document.body.classList.add('app-minimizing');
  setTimeout(() => {
    capture.minimize();
    document.body.classList.remove('app-minimizing');
  }, 160);
}

const closeApp = () => {
  capture.close()
}

const onMouseDown = (mouseDownEvent: MouseEvent) => {
  if (mouseDownEvent.button !== 0) return

  const target = mouseDownEvent.target as HTMLElement
  if (
    target.closest('.left-actions') ||
    target.closest('.center-actions') ||
    target.closest('.right-actions') ||
    target.closest('.project-switcher') ||
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
        :project="project"
        :is-saving="isSaving"
        @open-project="emit('open-project', $event)"
      />
      <div class="history-actions" @dblclick.stop>
        <Button
          variant="ghost"
          size="xs"
          :icon="Undo2"
          :disabled="!canUndo"
          tooltip="Undo (Ctrl+Z)"
          :tooltip-position="historyTooltipPosition || 'bottom'"
          @click.stop="emit('undo')"
        />
        <Button
          variant="ghost"
          size="xs"
          :icon="Redo2"
          :disabled="!canRedo"
          tooltip="Redo (Ctrl+Y)"
          :tooltip-position="historyTooltipPosition || 'bottom'"
          @click.stop="emit('redo')"
        />
      </div>
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

.history-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}

.center-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.toolbar-divider {
  width: 1px;
  height: 18px;
  background-color: var(--color-border);
  margin: 0 4px;
}

.preset-dropdown-btn,
.crop-btn,
.add-track-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--fast) ease;
}

.preset-dropdown-btn:hover,
.crop-btn:hover,
.add-track-button:hover,
.preset-dropdown-btn.is-open,
.crop-btn.active,
.add-track-button.is-open {
  background: var(--color-bg-surface-hover);
  border-color: var(--color-border-strong);
}

.crop-btn.active {
  background: var(--color-primary-light, rgba(255, 90, 31, 0.15));
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-icon,
.add-icon {
  width: 14px;
  height: 14px;
}

.chevron-icon {
  width: 12px;
  height: 12px;
  color: var(--text-muted);
  transition: transform var(--fast) ease;
}

.chevron-icon.is-flipped {
  transform: rotate(180deg);
}

.preset-menu-content,
.add-menu-content {
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 120px;
  background: var(--color-bg-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}

.preset-menu-item,
.add-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--fast) ease;
}

.preset-menu-item:hover,
.add-menu-item:hover {
  background: var(--color-bg-surface-hover);
}

.preset-menu-item.active {
  background: var(--color-primary-light, rgba(255, 90, 31, 0.15));
  color: var(--color-primary);
  font-weight: 700;
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
