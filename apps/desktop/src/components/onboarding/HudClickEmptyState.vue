<script setup lang="ts">
import { Check, Layout, Monitor, ScrollText, Video } from '@lucide/vue';
import Button from '~/components/ui/button/Button.vue';
import ButtonGroup from '~/components/ui/button/ButtonGroup.vue';
import Select from '~/components/ui/select/Select.vue';
import AudioIconMeter from '~/components/hud/audio/AudioIconMeter.vue';
import { resolvePublicAssetUrl } from '~/utils/public-asset';

const micOptions = [{ value: 'mic1', label: 'Studio Microphone' }];

const cameraOptions = [{ value: 'cam1', label: 'FaceTime HD Camera' }];
</script>

<template>
  <div class="hud-empty-state">
    <div class="mini-hud-card">
      <!-- Real ButtonGroup for Mode Tabs -->
      <ButtonGroup class="mini-mode-tabs">
        <Button variant="tab" size="sm" :class="{ active: true }">
          <template #icon><Monitor class="tab-mini-icon" /></template>
          Screen
        </Button>
        <Button variant="tab" size="sm">
          <template #icon><Layout class="tab-mini-icon" /></template>
          Window
        </Button>
      </ButtonGroup>

      <!-- Real Select Rows Stack -->
      <div class="mini-selectors-stack">
        <!-- Target Microphone Row (Animated click target) -->
        <div class="mini-device-row target-mic-row">
          <AudioIconMeter kind="mic" :enabled="true" :level="0.65" size="sm" />
          <div class="select-with-action">
            <Select model-value="mic1" :options="micOptions" size="sm" class="mini-real-select" :disabled="true" />
            <Button variant="secondary" size="sm" icon-only :icon="ScrollText" :disabled="true" />
          </div>
        </div>

        <!-- Camera Row -->
        <div class="mini-device-row">
          <div class="mini-camera-icon-box">
            <Video class="camera-mini-icon" />
          </div>
          <Select model-value="cam1" :options="cameraOptions" size="sm" class="mini-real-select" :disabled="true" />
        </div>
      </div>

      <!-- Real Record Action Button -->
      <div class="mini-record-row">
        <Button variant="primary" size="md" class="mini-record-btn" :disabled="true">
          <span class="mini-pulse-dot"></span>
          Start Recording
        </Button>
      </div>

      <!-- Animated Mock Popover Dropdown (Appears on click) -->
      <div class="animated-popover-dropdown">
        <div class="popover-item active">
          <span class="popover-item-text">Studio Microphone</span>
          <Check class="popover-check-icon" />
        </div>
        <div class="popover-item">
          <span class="popover-item-text">USB Audio Interface</span>
        </div>
        <div class="popover-item">
          <span class="popover-item-text">No Audio</span>
        </div>
      </div>

      <!-- Animated Mouse Pointer & Click Ripple -->
      <div class="animated-cursor-layer">
        <div class="cursor-ripple"></div>
        <img
          :src="resolvePublicAssetUrl('/macOsSvgCursors/handpointing.svg')"
          alt=""
          class="animated-cursor"
          aria-hidden="true"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 16px;
  text-align: center;
  user-select: none;
  box-sizing: border-box;
}

.mini-hud-card {
  width: 100%;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  background: transparent;
  padding: 0;
  box-sizing: border-box;
}

.mini-mode-tabs {
  width: 100%;
}

.tab-mini-icon {
  width: 13px;
  height: 13px;
}

.mini-selectors-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mini-device-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.select-with-action {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mini-camera-icon-box {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

.camera-mini-icon {
  width: 16px;
  height: 16px;
}

.mini-real-select {
  flex: 1;
  min-width: 0;
}

.mini-record-row {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.mini-record-btn {
  width: 100%;
  height: 36px;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.mini-pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
}

/* Animated Popover Dropdown Menu */
.animated-popover-dropdown {
  position: absolute;
  top: 98px;
  left: 36px;
  width: 195px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 20;
  pointer-events: none;
  animation: popoverDropAnim 4s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  transform-origin: top center;
}

.popover-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.popover-item.active {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
  font-weight: 600;
}

.popover-check-icon {
  width: 12px;
  height: 12px;
  color: var(--color-primary);
}

@keyframes popoverDropAnim {
  0%,
  43% {
    opacity: 0;
    transform: scale(0.92) translateY(-4px);
  }
  46%,
  82% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  88%,
  100% {
    opacity: 0;
    transform: scale(0.92) translateY(-4px);
  }
}

/* Animated Cursor Layer & Ripple */
.animated-cursor-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 30;
}

.animated-cursor {
  position: absolute;
  width: 28px;
  height: 28px;
  top: 142px;
  left: 215px;
  transform-origin: 9.5px 7px;
  animation: hudCursorMoveAndClick 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.4));
}

.cursor-ripple {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--color-primary);
  top: 73px;
  left: 125px;
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
  animation: hudRippleAnim 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.target-mic-row {
  animation: hudMicSelectGlow 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  padding: 2px;
  border: 1px solid transparent;
}

@keyframes hudMicSelectGlow {
  0%,
  18% {
    border-color: transparent;
    box-shadow: none;
    background: transparent;
  }
  20%,
  40% {
    border-color: rgba(245, 158, 11, 0.5);
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    border-radius: 8px;
  }
  43%,
  82% {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.35);
    border-radius: 8px;
  }
  90%,
  100% {
    border-color: transparent;
    box-shadow: none;
    background: transparent;
  }
}

@keyframes hudCursorMoveAndClick {
  0% {
    top: 142px;
    left: 215px;
    transform: scale(1);
  }
  22% {
    top: 66px;
    left: 115.5px;
    transform: scale(1);
  }
  40% {
    top: 66px;
    left: 115.5px;
    transform: scale(1);
  }
  42% {
    top: 66px;
    left: 115.5px;
    transform: scale(0.82);
  }
  46% {
    top: 66px;
    left: 115.5px;
    transform: scale(1);
  }
  58% {
    top: 114px;
    left: 130px;
    transform: scale(1);
  }
  80% {
    top: 114px;
    left: 130px;
    transform: scale(1);
  }
  100% {
    top: 142px;
    left: 215px;
    transform: scale(1);
  }
}

@keyframes hudRippleAnim {
  0%,
  41% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  43% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.85;
  }
  54% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
}
</style>
