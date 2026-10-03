<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  bars: readonly number[];
  selected: boolean;
  deferDraw?: boolean;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let animationFrame = 0;

const resampleBars = (bars: readonly number[], width: number) => {
  if (bars.length === 0) return bars;
  const count = Math.max(1, Math.floor(width / 3));
  if (count === bars.length) return bars;
  if (count > bars.length) {
    if (bars.length === 1) return Array.from({ length: count }, () => bars[0] ?? 0);
    return Array.from({ length: count }, (_, index) => {
      const position = (index * (bars.length - 1)) / Math.max(1, count - 1);
      const leftIndex = Math.floor(position);
      const rightIndex = Math.min(bars.length - 1, leftIndex + 1);
      const mix = position - leftIndex;
      return (bars[leftIndex] ?? 0) * (1 - mix) + (bars[rightIndex] ?? 0) * mix;
    });
  }
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
  const bars = resampleBars(props.bars, width);
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
  if (props.deferDraw) return;
  window.cancelAnimationFrame(animationFrame);
  animationFrame = window.requestAnimationFrame(draw);
};

watch([() => props.bars, () => props.selected], () => void nextTick(scheduleDraw), { deep: true });
watch(
  () => props.deferDraw,
  (deferDraw) => {
    if (deferDraw) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      return;
    }
    void nextTick(scheduleDraw);
  },
);

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
