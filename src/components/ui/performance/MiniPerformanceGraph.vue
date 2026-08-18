<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';

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
    sampleTimestamp?: number;
  }>(),
  {
    width: 82,
    height: 20,
    sampleCapacity: 48,
    animationMs: 500,
    fill: true,
  },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);

let activeSamples: number[] = [];
let slideOffsetProgress = 1;
let animationStartTime = 0;
let animationFrame: number | null = null;
let activeSampleTimestamp: number | undefined;

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

function samplesEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function traceScrollingPath(
  context: CanvasRenderingContext2D,
  samples: readonly number[],
  progress: number,
  capacity: number,
  width: number,
  height: number,
) {
  const count = samples.length;
  if (count === 0) return;

  const dx = width / Math.max(1, capacity - 1);
  const pointsX: number[] = new Array(count);
  const pointsY: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    pointsX[i] = width - (count - 1 - i + progress) * dx;
    pointsY[i] = getPointY(samples[i] ?? 0, height);
  }

  context.beginPath();
  context.moveTo(0, pointsY[0]!);
  context.lineTo(pointsX[0]!, pointsY[0]!);

  for (let i = 1; i < count; i++) {
    const prevX = pointsX[i - 1]!;
    const prevY = pointsY[i - 1]!;
    const currX = pointsX[i]!;
    const currY = pointsY[i]!;
    const midX = (prevX + currX) / 2;
    context.bezierCurveTo(midX, prevY, midX, currY, currX, currY);
  }

  context.lineTo(width, pointsY[count - 1]!);
}

function draw(samples: readonly number[], progress: number) {
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

  if (samples.length === 0 || width <= 0 || height <= 0) return;

  const capacity =
    props.sampleCapacity !== undefined && props.sampleCapacity > 0
      ? Math.max(2, Math.round(props.sampleCapacity))
      : samples.length;

  const color = resolveColor(canvas, props.color);

  context.lineCap = 'round';
  context.lineJoin = 'round';

  traceScrollingPath(context, samples, progress, capacity, width, height);

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

function stepAnimation(timestamp: number) {
  const duration = Math.max(1, props.animationMs ?? 500);
  const elapsed = timestamp - animationStartTime;
  const linear = Math.min(1, Math.max(0, elapsed / duration));
  slideOffsetProgress = linear;

  if (linear < 1) {
    draw(activeSamples, slideOffsetProgress);
    animationFrame = requestAnimationFrame(stepAnimation);
  } else {
    animationFrame = null;
    slideOffsetProgress = 1;
    draw(activeSamples, 1);
  }
}

function onValuesUpdate() {
  const nextSamples = cleanValues(props.values, props.sampleCapacity);
  const hasTimestamp = typeof props.sampleTimestamp === 'number' && Number.isFinite(props.sampleTimestamp);
  const hasNewSample = hasTimestamp
    ? props.sampleTimestamp !== activeSampleTimestamp
    : !samplesEqual(nextSamples, activeSamples);

  if (!hasNewSample) {
    if (!samplesEqual(nextSamples, activeSamples)) activeSamples = nextSamples.slice();
    draw(activeSamples, slideOffsetProgress);
    return;
  }

  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  const duration = props.animationMs ?? 500;
  activeSampleTimestamp = hasTimestamp ? props.sampleTimestamp : undefined;

  if (duration <= 0) {
    activeSamples = nextSamples.slice();
    slideOffsetProgress = 0;
    draw(activeSamples, 0);
    return;
  }

  activeSamples = nextSamples.slice();
  slideOffsetProgress = 0;
  draw(activeSamples, 0);
  if (activeSamples.length === 0) return;

  animationStartTime = performance.now();
  animationFrame = requestAnimationFrame(stepAnimation);
}

onMounted(() => {
  onValuesUpdate();
});

onUnmounted(() => {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
});

watch(
  () => [props.values, props.sampleTimestamp, props.sampleCapacity, props.animationMs] as const,
  () => {
    onValuesUpdate();
  },
  { deep: true },
);

watch(
  () => [props.color, props.fill, props.width, props.height] as const,
  () => {
    draw(activeSamples, slideOffsetProgress);
  },
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
