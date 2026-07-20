<script setup lang="ts">
import { ref } from 'vue'
import Button from '~/ui/button/Button.vue'
import Slider from '~/ui/slider/Slider.vue'
import { 
  Play, Pause, Scissors, Download, ArrowLeft, X, Minus, RotateCcw, Volume2
} from '@lucide/vue'

const emit = defineEmits(['back-to-hud'])

const isPlaying = ref(false)
const progress = ref(35)
const volume = ref(70)

const closeApp = () => {
  // @ts-ignore
  if (window.capture && window.capture.close) {
    // @ts-ignore
    window.capture.close()
  }
}

const minimizeApp = () => {
  // @ts-ignore
  if (window.capture && window.capture.minimize) {
    // @ts-ignore
    window.capture.minimize()
  }
}

// Custom requestAnimationFrame Dragging Logic
let isDragging = false
let startX = 0
let startY = 0
let currentScreenX = 0
let currentScreenY = 0
let rafId: number | null = null

const startDrag = (e: MouseEvent) => {
  if (e.button !== 0) return
  isDragging = true
  startX = e.clientX
  startY = e.clientY
  currentScreenX = e.screenX
  currentScreenY = e.screenY
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  updatePositionLoop()
}

const onDrag = (e: MouseEvent) => {
  currentScreenX = e.screenX
  currentScreenY = e.screenY
}

const stopDrag = () => {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

const updatePositionLoop = () => {
  if (!isDragging) return
  const targetX = currentScreenX - startX
  const targetY = currentScreenY - startY
  
  // @ts-ignore
  if (window.capture && window.capture.setPosition) {
    // @ts-ignore
    window.capture.setPosition(targetX, targetY)
  }
  rafId = requestAnimationFrame(updatePositionLoop)
}
</script>

<template>
  <div class="editor-wrapper">
    <!-- Header -->
    <header class="editor-header" @mousedown="startDrag">
      <div class="left-section" @mousedown.stop>
        <Button variant="ghost" size="sm" @click="$emit('back-to-hud')">
          <template #icon><ArrowLeft class="back-icon" /></template>
          Back to HUD
        </Button>
      </div>

      <span class="editor-title">Video Editor</span>

      <div class="window-actions" @mousedown.stop>
        <Button variant="ghost" size="sm" @click="minimizeApp">
          <template #icon><Minus class="btn-icon" /></template>
        </Button>
        <Button variant="ghost" size="sm" class="close-btn-override" @click="closeApp">
          <template #icon><X class="btn-icon" /></template>
        </Button>
      </div>
    </header>

    <!-- Editor Body -->
    <div class="editor-body">
      <!-- Simulated Video Player -->
      <div class="video-preview-card">
        <div class="video-placeholder">
          <div class="play-overlay" @click="isPlaying = !isPlaying">
            <button class="play-trigger-btn">
              <Play v-if="!isPlaying" class="play-trigger-icon" />
              <Pause v-else class="play-trigger-icon" />
            </button>
          </div>
          <span class="time-overlay">00:14 / 00:42</span>
        </div>
      </div>

      <!-- Timeline & Controls -->
      <div class="timeline-controls">
        <div class="progress-section">
          <Slider v-model="progress" :min="0" :max="100" />
        </div>

        <div class="controls-toolbar">
          <div class="toolbar-left">
            <Button variant="ghost" size="sm" :class="{ active: isPlaying }" @click="isPlaying = !isPlaying">
              <template #icon>
                <Play v-if="!isPlaying" class="tool-icon" />
                <Pause v-else class="tool-icon" />
              </template>
            </Button>
            <Button variant="ghost" size="sm">
              <template #icon><RotateCcw class="tool-icon" /></template>
            </Button>
            <div class="volume-tool">
              <Volume2 class="tool-icon" />
              <Slider v-model="volume" :min="0" :max="100" class="volume-slider" />
            </div>
          </div>

          <div class="toolbar-right">
            <Button variant="outline" size="md">
              <template #icon><Scissors class="tool-icon" /></template>
              Trim
            </Button>
            <Button variant="primary" size="md">
              <template #icon><Download class="tool-icon" /></template>
              Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-wrapper {
  width: 100%;
  height: 100%;
  background: #0f172a; /* Dark premium style for video editor */
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #f8fafc;
}

.editor-header {
  height: 60px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: grab;
}

.editor-header:active {
  cursor: grabbing;
}

.editor-title {
  font-size: 15px;
  font-weight: 600;
  color: #94a3b8;
}

.back-icon {
  width: 14px;
  height: 14px;
}

.window-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.close-btn-override:hover {
  color: var(--color-error) !important;
}

.editor-body {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.video-preview-card {
  flex: 1;
  background: #020617;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  overflow: hidden;
  position: relative;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.play-trigger-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: white;
  transition: all 0.2s ease;
}

.play-overlay:hover .play-trigger-btn {
  transform: scale(1.1);
  background: rgba(255, 255, 255, 0.2);
}

.play-trigger-icon {
  width: 22px;
  height: 22px;
  fill: white;
}

.time-overlay {
  position: absolute;
  bottom: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #e2e8f0;
}

.timeline-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-section {
  width: 100%;
}

/* Deep override style.css colors for dark editor theme */
:deep(.slider-value) {
  color: #94a3b8 !important;
}

.controls-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon {
  width: 18px;
  height: 18px;
}

.volume-tool {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 150px;
}

.volume-slider {
  flex-grow: 1;
}
</style>
