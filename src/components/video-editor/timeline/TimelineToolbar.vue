<script setup lang="ts">
import { computed } from "vue";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Plus,
  Video,
  Image as ImageIcon,
  Volume2,
  Type,
} from "@lucide/vue";
import Button from "~/ui/button/Button.vue";
import PopoverMenuButton from "~/ui/popover/PopoverMenuButton.vue";

const props = withDefaults(
  defineProps<{
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    zoomLevel: number; // 100 to 500
  }>(),
  { zoomLevel: 100 },
);

const emit = defineEmits<{
  (e: "update:isPlaying", value: boolean): void;
  (e: "update:currentTime", value: number): void;
  (e: "update:zoomLevel", value: number): void;
  (e: "add:element", type: "video" | "image" | "sound" | "caption"): void;
}>();

const handleAdd = (type: "video" | "image" | "sound" | "caption") => {
  emit("add:element", type);
};
const addItems = [
  { id: 'video', label: 'Video', icon: Video }, { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'sound', label: 'Sound', icon: Volume2 }, { id: 'caption', label: 'Text', icon: Type },
] as const;

const zoomPercentageText = computed(() => {
  return `${Math.round(props.zoomLevel)}%`;
});

const formatTime = (time: number) => {
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
};

const handleZoomReset = () => {
  emit("update:zoomLevel", 100);
};

const handleZoomIn = () => {
  emit("update:zoomLevel", Math.min(500, props.zoomLevel + 50));
};

const handleZoomOut = () => {
  emit("update:zoomLevel", Math.max(100, props.zoomLevel - 50));
};
</script>

<template>
  <div class="timeline-toolbar">
    <!-- Left Section with Add Popover -->
    <div class="left-section">
      <PopoverMenuButton label="Add" :icon="Plus" :items="addItems" @select="handleAdd($event as 'video' | 'image' | 'sound' | 'caption')" />
    </div>

    <!-- Centered Controls -->
    <div class="center-controls">
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

      <div class="time-display-container">
        <span class="time-current">{{ formatTime(currentTime) }}</span>
        <span class="time-separator">/</span>
        <span class="time-total">{{ formatTime(duration) }}</span>
      </div>
    </div>

    <!-- Right Zoom Controls -->
    <div class="zoom-controls">
      <span
        class="zoom-percent-text"
        @click="handleZoomReset"
        title="Double click to reset zoom"
        >{{ zoomPercentageText }}</span
      >
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="ZoomOut"
        tooltip="Zoom Out"
        :disabled="zoomLevel <= 100"
        @click="handleZoomOut"
      />
      <input
        type="range"
        min="100"
        max="500"
        step="10"
        :value="zoomLevel"
        class="zoom-slider"
        @input="
          emit(
            'update:zoomLevel',
            parseFloat(($event.target as HTMLInputElement).value),
          )
        "
      />
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="ZoomIn"
        tooltip="Zoom In"
        :disabled="zoomLevel >= 500"
        @click="handleZoomIn"
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

.left-section {
  display: flex;
  align-items: center;
}

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

.add-track-button:hover,
.add-track-button.is-open {
  background: var(--color-bg-surface-hover);
  border-color: var(--color-border-strong);
}

.add-icon {
  width: 14px;
  height: 14px;
  color: var(--color-primary);
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

.add-menu-content {
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 160px;
  background: var(--color-bg-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}

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

.add-menu-item:hover {
  background: var(--color-bg-surface-hover);
}

.menu-icon {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
}

.center-controls {
  display: flex;
  align-items: center;
  gap: 20px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
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

.zoom-percent-text {
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

.zoom-percent-text:hover {
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
