<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  bars: readonly number[];
  selected: boolean;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let animationFrame = 0;

const compactBars = (bars: readonly number[], width: number) => {
  const count = Math.max(1, Math.min(bars.length, Math.floor(width / 3)));
  if (count >= bars.length) return bars;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * bars.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * bars.length) / count));
    let peak = 0;
    for (let source = start; source < end; source += 1) peak = Math.max(peak, bars[source] ?? 0);
    return peak;
  });
};

const draw = () => {
  animationFrame = 0;
  const element = canvas.value;
  if (!element) return;
  const { width, height } = element.getBoundingClientRect();
  if (width <= 0 || height <= 0) return;
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const bitmapWidth = Math.max(1, Math.round(width * pixelRatio));
  const bitmapHeight = Math.max(1, Math.round(height * pixelRatio));
  if (element.width !== bitmapWidth) element.width = bitmapWidth;
  if (element.height !== bitmapHeight) element.height = bitmapHeight;
  const context = element.getContext('2d');
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const bars = compactBars(props.bars, width);
  if (bars.length === 0) return;
  const step = width / bars.length;
  context.strokeStyle = props.selected ? '#056247' : '#07865f';
  context.globalAlpha = props.selected ? 1 : 0.9;
  context.lineCap = 'round';
  context.lineWidth = Math.max(1, Math.min(2, step * 0.55));
  context.beginPath();
  bars.forEach((bar, index) => {
    if (!Number.isFinite(bar) || bar <= 0) return;
    const x = (index + 0.5) * step;
    const barHeight = Math.max(1, Math.min(height - 2, bar));
    context.moveTo(x, (height - barHeight) / 2);
    context.lineTo(x, (height + barHeight) / 2);
  });
  context.stroke();
};

const scheduleDraw = () => {
  window.cancelAnimationFrame(animationFrame);
  animationFrame = window.requestAnimationFrame(draw);
};

watch([() => props.bars, () => props.selected], () => void nextTick(scheduleDraw), { deep: true });

onMounted(() => {
  if (!canvas.value) return;
  resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(canvas.value);
  scheduleDraw();
});

onUnmounted(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="waveform-canvas" />
</template>

<style scoped>
.waveform-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
