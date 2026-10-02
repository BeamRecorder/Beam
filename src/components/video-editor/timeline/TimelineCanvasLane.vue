<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import { paintTimelineCanvas } from './timeline-canvas-paint';
import type { TimelineCanvasLaneProps, TimelineCanvasPalette } from './timeline-canvas-types';
import { useTimelineCanvasMarquee } from './composables/useTimelineCanvasMarquee';
const props = defineProps<TimelineCanvasLaneProps>();
const surface = ref<HTMLCanvasElement | null>(null);
let frame: number | null = null;
let theme: MutationObserver | null = null;
let size: ResizeObserver | null = null;
let palette: TimelineCanvasPalette;
let contentInset = 0;
const overscan = 96;
const readPalette = () => {
  if (!surface.value) return;
  const style = getComputedStyle(surface.value);
  const color = (key: string) => style.getPropertyValue(key).trim();
  palette = {
    background: color('--color-bg-field'),
    text: color('--text-primary'),
    border: color('--color-timeline-item-border'),
    selected: color('--color-timeline-selection'),
    video: color('--color-track-video'),
    annotation: color('--color-track-annotation'),
    blur: color('--color-track-blur'),
    audio: color('--color-track-audio'),
    zoom: color('--color-track-cursor'),
    highlight: color('--color-track-annotation'),
    labelBackground: color('--color-timeline-media-label'),
    labelText: color('--color-timeline-media-label-text'),
    curve: color('--text-secondary'),
    radius: parseFloat(color('--radius-sm')),
    effectInset: parseFloat(color('--timeline-effect-item-inset')),
    effectHeight: parseFloat(color('--timeline-effect-item-height')),
    tint: parseFloat(color('--timeline-item-tint')) / 100,
    disabledOpacity: Number(color('--timeline-disabled-opacity')),
  };
};
const draw = () => {
  frame = null;
  const canvas = surface.value;
  if (!canvas || props.width <= 0 || props.viewport.width <= 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Timeline canvas context unavailable.');
  const dpr = window.devicePixelRatio || 1;
  const height = canvas.clientHeight;
  // The viewport scroll is relative to the whole track, not its inset content.
  const left = Math.max(0, props.viewport.left - contentInset - overscan);
  const width = Math.max(1, Math.ceil(Math.min(props.width - left, props.viewport.width + overscan * 2)));
  if (canvas.width !== Math.ceil(width * dpr)) canvas.width = Math.ceil(width * dpr);
  if (canvas.height !== Math.ceil(height * dpr)) canvas.height = Math.ceil(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  engineMetrics.measure('prepare', () =>
    paintTimelineCanvas(
      ctx,
      props.items,
      {
        durationMs: props.durationMs,
        width: props.width,
        left,
        viewportWidth: width,
        height,
      },
      palette,
      props.artworks,
      marquee(),
    ),
  );
  // Commit placement with the bitmap. Vue must not move yesterday's pixels
  // while a redraw is queued; overscan covers the intervening scroll frame.
  canvas.style.left = `${left}px`;
  canvas.style.width = `${width}px`;
};
const schedule = () => {
  if (frame === null) frame = requestAnimationFrame(draw);
};
const marquee = useTimelineCanvasMarquee(surface, props, schedule);
watch(
  () => [props.items, props.artworks, props.durationMs, props.width, props.viewport.left, props.viewport.width],
  schedule,
  {
    flush: 'post',
  },
);
onMounted(() => {
  contentInset = parseFloat(getComputedStyle(surface.value!.parentElement!).marginLeft) || 0;
  readPalette();
  schedule();
  theme = new MutationObserver(() => {
    readPalette();
    schedule();
  });
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  size = new ResizeObserver(schedule);
  size.observe(surface.value!);
  window.addEventListener('resize', schedule);
});
onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame);
  theme?.disconnect();
  size?.disconnect();
  window.removeEventListener('resize', schedule);
});
</script>
<template>
  <canvas ref="surface" class="timeline-canvas-lane" aria-hidden="true" />
</template>
<style scoped>
.timeline-canvas-lane {
  position: absolute;
  top: 0;
  height: 100%;
  pointer-events: none;
}
</style>
