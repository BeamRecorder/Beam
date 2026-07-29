<script setup lang="ts">
import { capture } from '../../api/capture'
import VideoProjectEdition from './VideoProjectEdition.vue'
import ExportPopover from '../export/ExportPopover.vue'
import Button from '~/ui/button/Button.vue'
import { ArrowLeft, Minus, X, Undo2, Redo2 } from '@lucide/vue'
import { useTranslate } from '~/i18n/useTranslate'

const { t } = useTranslate('Topbar')

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
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        isDragging = true
        capture.dragStart()
      }
    }

    if (isDragging) capture.drag()
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
      <img src="/brand/DemoRecorderIcon.webp" class="brand-logo" alt="DemoRecorder" />
      <Button
        variant="ghost"
        size="sm"
        :icon="ArrowLeft"
        @click.stop="handleExit"
        class="exit-btn titlebar-btn"
      >
        {{ t('exitToHUD') }}
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
          :tooltip="t('undoTooltip')"
          :tooltip-position="historyTooltipPosition || 'bottom'"
          @click.stop="emit('undo')"
        />
        <Button
          variant="ghost"
          size="xs"
          :icon="Redo2"
          :disabled="!canRedo"
          :tooltip="t('redoTooltip')"
          :tooltip-position="historyTooltipPosition || 'bottom'"
          @click.stop="emit('redo')"
        />
      </div>
    </div>

    <div class="right-actions" @dblclick.stop>
      <ExportPopover v-if="exportRequest" :request="exportRequest" />
      <div class="window-controls">
        <button
          type="button"
          :aria-label="t('minimize')"
          class="control-btn"
          @click.stop="minimizeApp"
        >
          <Minus class="btn-icon" />
        </button>
        <button
          type="button"
          :aria-label="t('close')"
          class="control-btn close-btn"
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

.brand-logo {
  width: 24px;
  height: 24px;
  margin-left: 10px;
  object-fit: contain;
  flex: 0 0 auto;
}

.history-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}

.exit-btn {
  margin-right: 4px;
}

.window-controls {
  display: flex;
  height: 100%;
  align-items: stretch;
  margin-left: 4px;
}

.control-btn {
  appearance: none;
  width: 46px;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  outline: none;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: background-color var(--fast) ease, color var(--fast) ease;
}

.control-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
}

.control-btn:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.close-btn:hover {
  background: #c42b1c;
  color: #fff;
}

.btn-icon {
  width: 14px;
  height: 14px;
  pointer-events: none;
}
</style>
