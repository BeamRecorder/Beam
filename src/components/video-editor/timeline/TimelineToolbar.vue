<script setup lang="ts">
import { computed } from 'vue';
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    zoomLevel: number; // 100 to 500
  }>(),
  { zoomLevel: 100 }
);

const emit = defineEmits<{
  (e: 'update:isPlaying', value: boolean): void;
  (e: 'update:currentTime', value: number): void;
  (e: 'update:zoomLevel', value: number): void;
}>();

const zoomPercentageText = computed(() => {
  return `${Math.round(props.zoomLevel)}%`;
});

const formatTime = (time: number) => {
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

const handleZoomReset = () => {
  emit('update:zoomLevel', 100);
};

const handleZoomIn = () => {
  emit('update:zoomLevel', Math.min(500, props.zoomLevel + 50));
};

const handleZoomOut = () => {
  emit('update:zoomLevel', Math.max(100, props.zoomLevel - 50));
};
</script>

<template>
  <div class="timeline-toolbar">
    <!-- Left Navigation Controls -->
    <div class="nav-controls">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="SkipBack"
        tooltip="Go to Start"
        @click="emit('update:currentTime', 0)"
      />
      <Button
        variant="primary"
        size="sm"
        icon-only
        :icon="isPlaying ? Pause : Play"
        :tooltip="isPlaying ? 'Pause' : 'Play'"
        class="play-pause-btn"
        @click="emit('update:isPlaying', !isPlaying)"
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="SkipForward"
        tooltip="Go to End"
        @click="emit('update:currentTime', duration)"
      />
    </div>

    <!-- Center Time Display -->
    <div class="time-display-container">
      <span class="time-current">{{ formatTime(currentTime) }}</span>
      <span class="time-separator">/</span>
      <span class="time-total">{{ formatTime(duration) }}</span>
    </div>

    <!-- Right Zoom Controls -->
    <div class="zoom-controls">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="ZoomOut"
        tooltip="Zoom Out"
        :disabled="zoomLevel <= 100"
        @click="handleZoomOut"
      />
      
      <button 
        class="zoom-reset-btn" 
        title="Reset Zoom to 100%"
        @click="handleZoomReset"
      >
        {{ zoomPercentageText }}
      </button>

      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="ZoomIn"
        tooltip="Zoom In"
        :disabled="zoomLevel >= 500"
        @click="handleZoomIn"
      />

      <input
        type="range"
        min="100"
        max="500"
        step="10"
        :value="zoomLevel"
        class="zoom-slider"
        @input="emit('update:zoomLevel', parseFloat(($event.target as HTMLInputElement).value))"
      />
    </div>
  </div>
</template>

<style scoped>
.timeline-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
  height: 48px;
  user-select: none;
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.play-pause-btn {
  border-radius: var(--radius-full);
  background-color: var(--color-primary);
}

.play-pause-btn:hover {
  background-color: var(--color-primary-hover);
}

.time-display-container {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
}

.time-current {
  color: var(--text-primary);
}

.time-separator {
  color: var(--text-muted);
}

.time-total {
  color: var(--text-secondary);
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-reset-btn {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  cursor: pointer;
  min-width: 48px;
  text-align: center;
  transition: all var(--fast) ease;
}

.zoom-reset-btn:hover {
  background: var(--color-bg-surface-hover);
  color: var(--text-primary);
  border-color: var(--color-border-strong);
}

.zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 80px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-border);
  outline: none;
  cursor: pointer;
}

.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  border: none;
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s ease;
}

.zoom-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.zoom-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  border: none;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.zoom-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
}
</style>
