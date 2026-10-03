<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch, type CSSProperties } from 'vue';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { ZOOM_DEPTH_SCALES } from '@beam/engine/zoom/zoom-types';
import { clampFocusToScale } from '@beam/engine/zoom/zoom-playback';
import GlassHighlightSelection from '../editor/canvas/GlassHighlightSelection.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { StillZoomSelectionProps, StillZoomGesture } from './screenshot-zoom-selection-types';
const props = defineProps<StillZoomSelectionProps>();
const emit = defineEmits<{ update: [zoom: ZoomElement]; preview: [zoom: ZoomElement | null] }>();
const { t } = useTranslate('ZoomPanel');
const glass = shallowRef<InstanceType<typeof GlassHighlightSelection> | null>(null);
const surface = shallowRef<HTMLElement | null>(null);
const draft = shallowRef<ZoomElement | null>(null);
let origin: StillZoomGesture | null = null;
const style = computed<CSSProperties>(() => ({
  left: '0px',
  top: '0px',
  width: `${props.size.width}px`,
  height: `${props.size.height}px`,
}));
const targetStyle = computed<CSSProperties>(() => {
  const zoom = draft.value ?? props.zoom,
    scale = ZOOM_DEPTH_SCALES[zoom.depth];
  return {
    width: `${props.size.width / scale}px`,
    height: `${props.size.height / scale}px`,
    transform: `translate3d(${(zoom.focus.cx - 0.5 / scale) * props.size.width}px, ${(zoom.focus.cy - 0.5 / scale) * props.size.height}px, 0)`,
  };
});
const begin = (event: PointerEvent) => {
  if (event.button !== 0 || props.zoom.locked || props.panning) return;
  event.stopPropagation();
  event.preventDefault();
  origin = { x: event.clientX, y: event.clientY, id: event.pointerId, target: event.currentTarget as Element };
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
};
const move = (event: PointerEvent) => {
  if (!origin || origin.id !== event.pointerId) return;
  const rect = surface.value!.getBoundingClientRect();
  draft.value = {
    ...props.zoom,
    focus: clampFocusToScale(
      {
        cx: props.zoom.focus.cx + (event.clientX - origin.x) / rect.width,
        cy: props.zoom.focus.cy + (event.clientY - origin.y) / rect.height,
      },
      ZOOM_DEPTH_SCALES[props.zoom.depth],
    ),
  };
  emit('preview', draft.value);
};
const cancel = () => {
  const owned = origin;
  origin = null;
  draft.value = null;
  emit('preview', null);
  if (owned?.target.hasPointerCapture?.(owned.id)) owned.target.releasePointerCapture(owned.id);
};
const finish = (event: PointerEvent) => {
  if (!origin || origin.id !== event.pointerId) return;
  if (event.type === 'pointerup') {
    move(event);
    if (draft.value && !props.zoom.locked) emit('update', draft.value);
  }
  cancel();
};
const keyboard = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    cancel();
    return;
  }
  if (props.zoom.locked || props.panning || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
    return;
  event.stopPropagation();
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1,
    focus = { ...props.zoom.focus };
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    focus.cx += (event.key === 'ArrowLeft' ? -step : step) / props.canvasSize.width;
  else focus.cy += (event.key === 'ArrowUp' ? -step : step) / props.canvasSize.height;
  emit('update', { ...props.zoom, focus: clampFocusToScale(focus, ZOOM_DEPTH_SCALES[props.zoom.depth]) });
};
watch(() => [props.zoom.id, props.zoom.locked, props.panning], cancel);
onBeforeUnmount(cancel);
</script>
<template>
  <GlassHighlightSelection
    v-if="zoom.effect === 'glass'"
    ref="glass"
    :zoom="zoom"
    :canvas-size="canvasSize"
    :viewport-style="style"
    :panning="panning"
    @update="emit('update', $event)"
    @preview="emit('preview', glass?.draft ?? null)"
  />
  <div v-else ref="surface" class="still-zoom-selection" :style="style">
    <div
      class="focus-target"
      tabindex="0"
      @keydown="keyboard"
      :class="{ disabled: zoom.locked || panning }"
      :style="targetStyle"
      :aria-label="t('manualHint')"
      @pointerdown="begin"
      @pointermove="move"
      @pointerup="finish"
      @pointercancel="finish"
      @lostpointercapture="finish"
    />
  </div>
</template>
<style scoped>
.still-zoom-selection {
  position: absolute;
  z-index: 22;
  pointer-events: none;
}
.focus-target {
  position: absolute;
  left: 0;
  top: 0;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-sm);
  pointer-events: auto;
  cursor: move;
  touch-action: none;
}
.focus-target.disabled {
  pointer-events: none;
}
</style>
