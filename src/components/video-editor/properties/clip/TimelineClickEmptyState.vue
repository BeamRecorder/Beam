<script setup lang="ts">
import { Camera, MousePointer, Video } from '@lucide/vue'
import { useTranslate } from '~/i18n/useTranslate'
import { resolvePublicAssetUrl } from '~/utils/public-asset'

const { t } = useTranslate('ClipPropertiesPanel')
</script>

<template>
  <div class="timeline-empty-state empty-state">
    <div class="illustration-container">
      <!-- Mini Timeline Window strictly matching TimelineTracks.vue -->
      <div class="mini-timeline">
        <!-- Ruler Header -->
        <div class="timeline-ruler">
          <div class="ruler-info-spacer" />
          <div class="ruler-ticks-area">
            <span class="marker-label" style="left: 0%">0s</span>
            <span class="marker-label" style="left: 50%">2s</span>
            <span class="marker-label" style="left: 100%">4s</span>
            <div class="timeline-playhead" />
          </div>
        </div>

        <!-- Video Track Row -->
        <div class="track-row visual-track">
          <div class="track-info">
            <Video class="track-icon" />
            <span class="track-title">Screen</span>
          </div>
          <div class="track-content visual-content">
            <div class="timeline-clip-item target-clip">
              <span class="clip-center-title">Screen recording</span>
            </div>
          </div>
        </div>

        <!-- Webcam Track Row -->
        <div class="track-row visual-track">
          <div class="track-info">
            <Camera class="track-icon" />
            <span class="track-title">Webcam</span>
          </div>
          <div class="track-content visual-content">
            <div class="timeline-clip-item webcam-clip">
              <span class="clip-center-title">Webcam video</span>
            </div>
          </div>
        </div>

        <!-- Zooms Track Row -->
        <div class="track-row cursor-track">
          <div class="track-info static-info">
            <MousePointer class="track-icon" />
            <span class="track-title">Zooms</span>
          </div>
          <div class="track-content cursor-content" />
        </div>

        <!-- Animated Mouse Pointer & Ripple -->
        <div class="animated-cursor-layer">
          <div class="cursor-ripple" />
          <img
            :src="resolvePublicAssetUrl('/macOsSvgCursors/handpointing.svg')"
            alt="Cursor"
            class="animated-cursor"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>

    <!-- Text & Instructions -->
    <div class="text-content">
      <h3 class="empty-title">{{ t('noClipSelected') }}</h3>
      <p class="empty-desc">{{ t('noClipSelectedDesc') }}</p>
    </div>
  </div>
</template>

<style scoped>
.timeline-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 12px;
  text-align: center;
  gap: 16px;
  user-select: none;
}

.illustration-container {
  width: 100%;
  max-width: 290px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  position: relative;
  overflow: hidden;
  padding: 6px;
}

.mini-timeline {
  display: flex;
  flex-direction: column;
  gap: 3px;
  position: relative;
  background: var(--color-bg-element);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.timeline-ruler {
  height: 22px;
  display: flex;
  background: var(--color-bg-element);
  border-bottom: 1px solid var(--color-border);
}

.ruler-info-spacer {
  width: 65px;
  flex: 0 0 65px;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.ruler-ticks-area {
  flex: 1;
  position: relative;
  height: 100%;
  padding: 0 8px;
}

.marker-label {
  position: absolute;
  top: 4px;
  font-size: 8px;
  font-weight: 700;
  color: var(--text-muted);
  font-family: monospace;
}

.timeline-playhead {
  position: absolute;
  top: 0;
  left: 35%;
  width: 1.5px;
  height: 100%;
  background: var(--color-primary);
}

.track-row {
  display: flex;
  align-items: center;
  height: 28px;
  position: relative;
  background: var(--color-bg-element);
  border-top: 1px solid var(--color-border);
}

.track-info {
  width: 65px;
  height: 100%;
  flex: 0 0 65px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  color: var(--text-secondary);
}

.track-icon {
  width: 11px;
  height: 11px;
  color: var(--text-muted);
}

.track-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.track-content {
  flex: 1;
  height: 100%;
  position: relative;
}

.visual-content {
  background: var(--color-track-video-light, rgba(59, 130, 246, 0.08));
}

.cursor-content {
  background: var(--color-track-cursor-light, rgba(245, 158, 11, 0.08));
}

.timeline-clip-item {
  position: absolute;
  top: 3px;
  left: 5%;
  width: 85%;
  height: 20px;
  background: var(--color-track-video, #3b82f6);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  padding: 0 6px;
  color: #fff;
  font-size: 8px;
  font-weight: 700;
  transition: all 0.15s ease;
}

.webcam-clip {
  width: 60%;
  left: 20%;
  background: #8b5cf6;
}

.clip-center-title {
  font-size: 8px;
  white-space: nowrap;
}

/* Clip animation: Hover state -> Click state -> Selected glow */
.target-clip {
  animation: clipHoverAndSelect 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* Animated Cursor & Ripple */
.animated-cursor-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.animated-cursor {
  position: absolute;
  width: 28px;
  height: 28px;
  top: 75px;
  left: 210px;
  animation: cursorHoverAndClick 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}

.cursor-ripple {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--color-primary);
  top: 34px;
  left: 130px;
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
  animation: rippleAnim 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

/* Animation Timings for exact sequence:
   0s - 0.8s: Cursor approaches Screen clip
   0.8s - 1.6s: Cursor HOVERS over clip -> clip shows hover border (#ffffff)
   1.6s - 2.0s: Cursor CLICKS down -> ripple expands & clip gets selected glow!
   2.0s - 3.2s: Clip stays selected & glowing
   3.2s - 3.8s: Cursor moves away and loop resets
*/

@keyframes clipHoverAndSelect {
  0%,
  18% {
    border: 1px solid transparent;
    outline: 2px solid transparent;
    box-shadow: none;
  }
  20%,
  40% {
    /* Hover state */
    border: 1px solid rgba(255, 255, 255, 0.8);
    outline: 2px solid transparent;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
  43%,
  82% {
    /* Selected state */
    border: 1px solid transparent;
    outline: 2px solid var(--color-primary);
    box-shadow: 0 0 12px var(--color-primary);
  }
  90%,
  100% {
    border: 1px solid transparent;
    outline: 2px solid transparent;
    box-shadow: none;
  }
}

@keyframes cursorHoverAndClick {
  0% {
    top: 75px;
    left: 210px;
    transform: scale(1);
  }
  22% {
    top: 34px;
    left: 130px;
    transform: scale(1);
  }
  40% {
    top: 34px;
    left: 130px;
    transform: scale(1);
  }
  42% {
    top: 34px;
    left: 130px;
    transform: scale(0.82);
  }
  46% {
    top: 34px;
    left: 130px;
    transform: scale(1);
  }
  80% {
    top: 34px;
    left: 130px;
    transform: scale(1);
  }
  100% {
    top: 75px;
    left: 210px;
    transform: scale(1);
  }
}

@keyframes rippleAnim {
  0%,
  41% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  44% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.8;
  }
  56% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
}

.text-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 260px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.empty-desc {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>
