<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { TransitionPreset } from '~/media/shared/composition-types';
import { resolveClipTransitionState } from '~/media/shared/clip-transitions';

const props = defineProps<{ preset: TransitionPreset | null; active: boolean }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let frame: number | null = null;
let startedAt = 0;
let themeObserver: MutationObserver | null = null;

const draw = (now = 0) => {
  if (navigator.userAgent.includes('jsdom')) return;
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
          transitions: { entry: { preset: props.preset, durationMs: 500 }, exit: null },
        },
        timeMs,
      )
    : { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0 };
  const ratio = window.devicePixelRatio || 1;
  const width = element.clientWidth;
  const height = element.clientHeight;
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
  context.save();
  context.globalAlpha = state.opacity;
  context.translate(state.translateX * width, state.translateY * height);
  context.translate(width / 2, height / 2);
  context.scale(state.scale, state.scale);
  context.translate(-width / 2, -height / 2);
  context.filter = state.blur ? `blur(${state.blur * 0.24}px)` : 'none';
  const inset = 8;
  context.fillStyle = color('--color-bg-element', '#292929');
  context.roundRect(inset, inset, width - inset * 2, height - inset * 2, 5);
  context.fill();
  context.fillStyle = color('--color-primary', '#ff5a1f');
  context.roundRect(inset + 6, inset + 6, width * 0.38, height - inset * 2 - 12, 3);
  context.fill();
  context.fillStyle = color('--text-primary', '#f5f5f5');
  context.fillRect(width * 0.52, height * 0.34, width * 0.28, 3);
  context.fillStyle = color('--text-muted', '#8a8a8a');
  context.fillRect(width * 0.52, height * 0.5, width * 0.2, 3);
  context.restore();
  if (props.active && !reduced) frame = requestAnimationFrame(draw);
};

const sync = () => {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  startedAt = performance.now();
  draw(startedAt + (props.active ? 0 : 275));
};
watch(() => [props.active, props.preset], sync, { deep: true });
onMounted(() => {
  sync();
  themeObserver = new MutationObserver(sync);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
});
onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame);
  themeObserver?.disconnect();
});
</script>

<template><canvas ref="canvas" aria-hidden="true" /></template>

<style scoped>
canvas { display: block; width: 100%; height: 54px; }
</style>
