<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    values: readonly number[];
    color: string;
    fill?: boolean;
    width?: number;
    height?: number;
    label: string;
    sampleCapacity?: number;
    animationMs?: number;
  }>(),
  {
    width: 82,
    height: 20,
    sampleCapacity: 48,
    animationMs: 0,
    fill: true,
  },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const colorCache = new Map<string, string>();

function cleanValues(values: readonly number[], sampleCapacity?: number): number[] {
  const normalized: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (typeof val === 'number' && Number.isFinite(val)) {
      normalized.push(Math.max(0, Math.min(1, val)));
    }
  }
  if (normalized.length === 0) return [];

  const capacity =
    sampleCapacity !== undefined && sampleCapacity > 0 ? Math.max(2, Math.round(sampleCapacity)) : normalized.length;

  return normalized.length > capacity ? normalized.slice(-capacity) : normalized;
}

function resolveColor(canvas: HTMLCanvasElement, color: string): string {
  const cached = colorCache.get(color);
  if (cached) return cached;

  let resolved = color;
  if (color.startsWith('var(')) {
    const match = /^var\((--[^)]+)\)$/.exec(color);
    if (match?.[1]) {
      const value = getComputedStyle(canvas).getPropertyValue(match[1]).trim();
      if (value) resolved = value;
    }
  }
  colorCache.set(color, resolved);
  return resolved;
}

function getPointY(value: number, height: number): number {
  return height - value * Math.max(1, height - 3) - 1.5;
}

function getPointX(index: number, total: number, width: number): number {
  return total <= 1 ? width / 2 : (index / (total - 1)) * width;
}

function traceCurve(context: CanvasRenderingContext2D, values: readonly number[], width: number, height: number) {
  const count = values.length;
  if (count === 0) return;

  if (count === 1) {
    const y = getPointY(values[0] ?? 0, height);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    return;
  }

  const firstY = getPointY(values[0] ?? 0, height);
  const firstX = getPointX(0, count, width);

  context.beginPath();
  context.moveTo(firstX, firstY);

  for (let i = 1; i < count; i++) {
    const prevX = getPointX(i - 1, count, width);
    const prevY = getPointY(values[i - 1] ?? 0, height);
    const currX = getPointX(i, count, width);
    const currY = getPointY(values[i] ?? 0, height);
    const midX = (prevX + currX) / 2;
    context.bezierCurveTo(midX, prevY, midX, currY, currX, currY);
  }
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const width = Math.max(0, props.width);
  const height = Math.max(0, props.height);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.max(1, Math.round(width * ratio));
  const backingHeight = Math.max(1, Math.round(height * ratio));

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const values = cleanValues(props.values, props.sampleCapacity);
  if (values.length === 0 || width <= 0 || height <= 0) return;

  const color = resolveColor(canvas, props.color);

  context.lineCap = 'round';
  context.lineJoin = 'round';

  traceCurve(context, values, width, height);

  // Stroke the crisp curve
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.globalAlpha = 0.95;
  context.stroke();

  // Fill area under curve with vertical gradient
  if (props.fill) {
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();

    if (typeof context.createLinearGradient === 'function') {
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color);
      context.fillStyle = gradient;
    } else {
      context.fillStyle = color;
    }

    context.globalAlpha = 0.14;
    context.fill();
  }

  context.globalAlpha = 1;
}

onMounted(() => {
  draw();
});

watch(
  () => [props.values, props.color, props.fill, props.width, props.height, props.sampleCapacity] as const,
  () => {
    draw();
  },
  { deep: true },
);
</script>

<template>
  <canvas ref="canvasRef" class="mini-performance-graph" role="img" :aria-label="label">{{ label }}</canvas>
</template>

<style scoped>
.mini-performance-graph {
  display: block;
  flex-shrink: 0;
}
</style>
