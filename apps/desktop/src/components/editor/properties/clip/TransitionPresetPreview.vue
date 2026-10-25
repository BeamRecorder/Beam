<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { TransitionPreset } from '@beam/engine/shared/composition-types';
import { drawCanvasTransitionFrame } from '@beam/runtime/composition/transitions/render-canvas-transition';
import { resolveClipTransitionState } from '@beam/engine/shared/clip-transitions';

const props = defineProps<{
  preset: TransitionPreset | null;
  active: boolean;
  visible?: boolean;
}>();
const canvas = ref<HTMLCanvasElement | null>(null);
let frame: number | null = null;
let startedAt = 0;
let resizeObserver: ResizeObserver | null = null;
let source: OffscreenCanvas | null = null;
let themeObserver: MutationObserver | null = null;

const draw = (now = 0) => {
  frame = null;
  if (navigator.userAgent.includes('jsdom') || props.visible === false) return;
  const element = canvas.value;
  const context = element?.getContext('2d');
  if (!element || !context) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const progress = props.preset ? (reduced ? 0.55 : ((now - startedAt) % 1_100) / 1_100) : 1;
  const timeMs = progress < 0.82 ? (progress / 0.82) * 500 : 500;
  const state = props.preset
    ? resolveClipTransitionState(
        {
          timelineStartMs: 0,
          timelineDurationMs: 1_000,
          transitions: {
            entry: { preset: props.preset, durationMs: 500 },
            exit: null,
          },
        },
        timeMs,
      )
    : { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
  const ratio = window.devicePixelRatio || 1;
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (width < 1 || height < 1) return;
  if (element.width !== width * ratio || element.height !== height * ratio) {
    element.width = width * ratio;
    element.height = height * ratio;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const theme = getComputedStyle(element);
  const color = (token: string, fallback: string) => theme.getPropertyValue(token).trim() || fallback;
  context.fillStyle = color('--color-bg-surface', '#1e1e1e');
  context.fillRect(0, 0, width, height);
  source ??= new OffscreenCanvas(Math.round(width * ratio), Math.round(height * ratio));
  if (source.width !== Math.round(width * ratio)) source.width = Math.round(width * ratio);
  if (source.height !== Math.round(height * ratio)) source.height = Math.round(height * ratio);
  const picture = source.getContext('2d');
  if (!picture) throw new Error('Transition preview context is unavailable.');
  picture.setTransform(ratio, 0, 0, ratio, 0, 0);
  picture.clearRect(0, 0, width, height);
  const inset = 8;
  picture.fillStyle = color('--color-bg-element', '#292929');
  picture.beginPath();
  picture.roundRect(inset, inset, width - inset * 2, height - inset * 2, 5);
  picture.fill();
  picture.fillStyle = color('--text-secondary', '#a0a0a0');
  picture.beginPath();
  picture.roundRect(inset + 6, inset + 6, width * 0.38, height - inset * 2 - 12, 3);
  picture.fill();
  picture.fillStyle = color('--text-primary', '#f5f5f5');
  picture.fillRect(width * 0.52, height * 0.34, width * 0.28, 3);
  picture.fillStyle = color('--text-muted', '#8a8a8a');
  picture.fillRect(width * 0.52, height * 0.5, width * 0.2, 3);
  drawCanvasTransitionFrame(
    context,
    source,
    { width, height },
    { x: 0, y: 0, width, height },
    state,
    color('--color-bg-surface', '#1e1e1e'),
  );
  if (props.active && !reduced) frame = requestAnimationFrame(draw);
};

const sync = () => {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  startedAt = performance.now();
  draw(startedAt + (props.active ? 0 : 275));
};
watch(() => [props.active, props.preset, props.visible], sync, { deep: true });
onMounted(() => {
  sync();
  resizeObserver = new ResizeObserver(sync);
  if (canvas.value) resizeObserver.observe(canvas.value);
  themeObserver = new MutationObserver(sync);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
});
onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame);
  themeObserver?.disconnect();
  resizeObserver?.disconnect();
  if (source) source.width = source.height = 1;
  source = null;
});
</script>

<template><canvas ref="canvas" aria-hidden="true" /></template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 54px;
}
</style>
