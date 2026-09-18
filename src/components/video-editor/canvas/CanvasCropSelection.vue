<script setup lang="ts">
import type { CropPixels } from '../composition/crop/crop-types';
import { nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
import { Check } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ResizeHandle from '~/ui/ResizeHandle/ResizeHandle.vue';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import { useTranslate } from '~/i18n/useTranslate';

const props = defineProps<{
  containerStyle: CSSProperties;
  overlayStyle: CSSProperties;
  measurements?: CropPixels | null;
}>();
const emit = defineEmits<{
  (event: 'move-start', value: PointerEvent): void;
  (event: 'move', value: PointerEvent): void;
  (event: 'move-end', value: PointerEvent): void;
  (event: 'resize-start', corner: ResizeCorner, value: PointerEvent): void;
  (event: 'resize-move', value: PointerEvent): void;
  (event: 'resize-end', value: PointerEvent): void;
  (event: 'done'): void;
}>();
const { t } = useTranslate('EditorCanvas');
const overlay = ref<HTMLElement | null>(null);
const hud = ref<HTMLElement | null>(null);
const hudStyle = ref<CSSProperties>({ visibility: 'hidden' });
let frame = 0;
let observer: ResizeObserver | null = null;

const positionHud = () => {
  frame = 0;
  if (!overlay.value || !hud.value) return;
  const crop = overlay.value.getBoundingClientRect();
  const controls = hud.value.getBoundingClientRect();
  const gap = 10;
  const margin = 8;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const roomBelow = viewportHeight - crop.bottom - margin;
  const roomAbove = crop.top - margin;
  const placeBelow = roomBelow >= controls.height + gap || roomBelow >= roomAbove;
  const unclampedTop = placeBelow ? crop.bottom + gap : crop.top - controls.height - gap;
  const top = Math.max(margin, Math.min(viewportHeight - controls.height - margin, unclampedTop));
  const left = Math.max(
    margin,
    Math.min(viewportWidth - controls.width - margin, crop.left + crop.width / 2 - controls.width / 2),
  );
  hudStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    visibility: 'visible',
  };
};
const scheduleHudPosition = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(positionHud);
};
watch(
  () => [props.containerStyle, props.overlayStyle, props.measurements],
  () => void nextTick(scheduleHudPosition),
  { deep: true, flush: 'post' },
);
onMounted(() => {
  void nextTick(() => {
    scheduleHudPosition();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleHudPosition);
      if (overlay.value) observer.observe(overlay.value);
      if (hud.value) observer.observe(hud.value);
    }
  });
  window.addEventListener('resize', scheduleHudPosition);
  window.addEventListener('scroll', scheduleHudPosition, true);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
  window.removeEventListener('resize', scheduleHudPosition);
  window.removeEventListener('scroll', scheduleHudPosition, true);
});
</script>

<template>
  <div class="crop-container" :style="containerStyle">
    <div class="crop-mask-wrapper">
      <div class="crop-mask-hole" :style="overlayStyle" />
    </div>
    <div
      ref="overlay"
      class="crop-overlay-box"
      :style="overlayStyle"
      @pointerdown="emit('move-start', $event)"
      @pointermove="emit('move', $event)"
      @pointerup="emit('move-end', $event)"
      @pointercancel="emit('move-end', $event)"
      @lostpointercapture="emit('move-end', $event)"
    >
      <div class="crop-grid">
        <div class="grid-line vertical line-1" />
        <div class="grid-line vertical line-2" />
        <div class="grid-line horizontal line-1" />
        <div class="grid-line horizontal line-2" />
      </div>
      <ResizeHandle
        @resize-start="(corner, event) => emit('resize-start', corner, event)"
        @resize-move="(_corner, event) => emit('resize-move', event)"
        @resize-end="(_corner, event) => emit('resize-end', event)"
      />
    </div>
    <Teleport to="body">
      <div
        ref="hud"
        class="crop-hud"
        :class="{ 'has-measurements': measurements }"
        :style="hudStyle"
        @pointerdown.stop
        @mousedown.stop
      >
        <div v-if="measurements" class="crop-hud-measurements" aria-hidden="true">
          <strong class="crop-dimensions">{{ measurements.width }} × {{ measurements.height }} px</strong>
          <span class="crop-hud-divider" />
          <span class="crop-measurement">↑ {{ measurements.top }}</span>
          <span class="crop-measurement">→ {{ measurements.right }}</span>
          <span class="crop-measurement">↓ {{ measurements.bottom }}</span>
          <span class="crop-measurement">← {{ measurements.left }}</span>
        </div>
        <Button variant="primary" size="xs" :icon="Check" class="crop-ok-button" @click.stop="emit('done')">
          {{ t('ok') }}
        </Button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.crop-container {
  position: absolute;
  z-index: 20;
  pointer-events: none;
}
.crop-mask-wrapper {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: var(--radius-sm, 4px);
}
.crop-mask-hole {
  position: absolute;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  pointer-events: none;
}
.crop-overlay-box {
  position: absolute;
  border: 2px solid var(--color-primary, #ff5a1f);
  cursor: move;
  box-sizing: border-box;
  pointer-events: auto;
}
.crop-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.grid-line {
  position: absolute;
  background: rgba(255, 255, 255, 0.35);
}
.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.grid-line.vertical.line-1 {
  left: 33.333%;
}
.grid-line.vertical.line-2 {
  left: 66.666%;
}
.grid-line.horizontal {
  left: 0;
  right: 0;
  height: 1px;
}
.grid-line.horizontal.line-1 {
  top: 33.333%;
}
.grid-line.horizontal.line-2 {
  top: 66.666%;
}
.crop-hud {
  position: fixed;
  z-index: 2100;
  display: flex;
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  padding: 5px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-bg-surface) 94%, transparent);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  backdrop-filter: blur(12px);
}
.crop-hud-measurements {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding-left: 5px;
  color: var(--text-primary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.crop-dimensions {
  font-weight: 650;
}
.crop-measurement {
  color: var(--text-secondary);
}
.crop-hud-divider {
  width: 1px;
  height: 14px;
  background: var(--color-border);
}
.crop-ok-button {
  flex-shrink: 0;
}
@media (max-width: 520px) {
  .crop-hud.has-measurements {
    align-items: stretch;
  }
  .crop-hud-measurements {
    flex-wrap: wrap;
    gap: 3px 7px;
    white-space: normal;
  }
  .crop-hud-divider {
    display: none;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .crop-hud {
    background: var(--color-bg-surface);
    backdrop-filter: none;
  }
}
</style>
