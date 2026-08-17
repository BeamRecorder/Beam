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
    animationMs?: number;
    sampleCapacity?: number;
  }>(),
  { width: 82, height: 20, animationMs: 480, sampleCapacity: 48, fill: true },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);

let currentWindow: number[] = [];
let targetWindow: number[] = [];
let slideProgress = 1;
let animationFrame: number | null = null;
let animationStartTime = 0;
let mounted = false;

const colorCache = new Map<string, string>();

function normalizeValues(values: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (typeof val === 'number' && Number.isFinite(val)) {
      result.push(Math.max(0, Math.min(1, val)));
    }
  }
  return result;
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

function traceSlidingCurve(
  context: CanvasRenderingContext2D,
  samples: readonly number[],
  progress: number,
  capacity: number,
  width: number,
  height: number,
) {
  const count = samples.length;
  if (count === 0) return;

  if (count === 1) {
    const y = getPointY(samples[0] ?? 0, height);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    return;
  }

  const dx = width / Math.max(1, capacity - 1);
  const pointsX: number[] = new Array(count);
  const pointsY: number[] = new Array(count);

  if (progress >= 1 || count <= capacity) {
    for (let i = 0; i < count; i++) {
      pointsX[i] = count <= capacity ? (i / (count - 1)) * width : (i - (count - capacity)) * dx;
      pointsY[i] = getPointY(samples[i] ?? 0, height);
    }
  } else {
    // During slide transition (count = capacity + 1)
    for (let i = 0; i < count; i++) {
      pointsX[i] = (i - 1 + progress) * dx;
      pointsY[i] = getPointY(samples[i] ?? 0, height);
    }
  }

  context.beginPath();
  context.moveTo(pointsX[0]!, pointsY[0]!);

  if (count === 2) {
    const midX = (pointsX[0]! + pointsX[1]!) / 2;
    context.bezierCurveTo(midX, pointsY[0]!, midX, pointsY[1]!, pointsX[1]!, pointsY[1]!);
    return;
  }

  // Smooth Catmull-Rom to Cubic Bezier curve without intermediate object allocations
  const tension = 0.22;
  for (let i = 0; i < count - 1; i++) {
    const x0 = pointsX[Math.max(0, i - 1)]!;
    const y0 = pointsY[Math.max(0, i - 1)]!;

    const x1 = pointsX[i]!;
    const y1 = pointsY[i]!;

    const x2 = pointsX[i + 1]!;
    const y2 = pointsY[i + 1]!;

    const x3 = pointsX[Math.min(count - 1, i + 2)]!;
    const y3 = pointsY[Math.min(count - 1, i + 2)]!;

    const cp1x = x1 + ((x2 - x0) * tension) / 3;
    const cp1y = y1 + ((y2 - y0) * tension) / 3;

    const cp2x = x2 - ((x3 - x1) * tension) / 3;
    const cp2y = y2 - ((y3 - y1) * tension) / 3;

    context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
  }
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
      : Math.max(2, samples.length);

  const color = resolveColor(canvas, props.color);

  context.lineCap = 'round';
  context.lineJoin = 'round';

  traceSlidingCurve(context, samples, progress, capacity, width, height);

  // Stroke the continuous curve
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
  const duration = Math.max(1, props.animationMs ?? 480);
  const elapsed = timestamp - animationStartTime;
  const linear = Math.min(1, Math.max(0, elapsed / duration));
  slideProgress = linear;

  if (linear < 1) {
    draw(targetWindow, slideProgress);
    animationFrame = requestAnimationFrame(stepAnimation);
  } else {
    animationFrame = null;
    currentWindow = targetWindow.slice(-props.sampleCapacity!);
    slideProgress = 1;
    draw(currentWindow, 1);
  }
}

function update() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  const raw = normalizeValues(props.values);
  const capacity =
    props.sampleCapacity !== undefined && props.sampleCapacity > 0
      ? Math.max(2, Math.round(props.sampleCapacity))
      : raw.length;

  if (raw.length === 0) {
    currentWindow = [];
    targetWindow = [];
    slideProgress = 1;
    draw([], 1);
    return;
  }

  const windowed = raw.slice(-capacity);

  if (!mounted || (props.animationMs ?? 0) <= 0 || currentWindow.length === 0) {
    currentWindow = windowed;
    targetWindow = windowed;
    slideProgress = 1;
    draw(targetWindow, 1);
    return;
  }

  // Combine previous tail and new window for a continuous 1-sample slide
  const slidingWindow = currentWindow.length >= capacity ? [currentWindow[0]!, ...windowed] : windowed;
  targetWindow = slidingWindow;
  slideProgress = 0;
  animationStartTime = performance.now();
  animationFrame = requestAnimationFrame(stepAnimation);
}

onMounted(() => {
  mounted = true;
  update();
});

onUnmounted(() => {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
});

watch(
  () =>
    [
      props.values,
      props.color,
      props.fill,
      props.width,
      props.height,
      props.animationMs,
      props.sampleCapacity,
    ] as const,
  () => {
    update();
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
