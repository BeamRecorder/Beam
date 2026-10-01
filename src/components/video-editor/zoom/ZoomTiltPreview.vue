<script setup lang="ts">
import { computed } from 'vue';
import { cameraTiltForControls } from './composition-camera';
import { projectPerspectivePoint } from './perspective-projection';
import type { ZoomTiltPreviewControls } from './zoom-tilt-preset-types';

const props = defineProps<{ preset: ZoomTiltPreviewControls; compact?: boolean }>();
const geometry = computed(() => {
  const transform = cameraTiltForControls(props.preset.intensity, props.preset.horizontal, props.preset.vertical);
  const bounds = { x: 22, y: 16, width: 76, height: 50 };
  const path = (left: number, top: number, width: number, height: number) =>
    [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height],
    ]
      .map(([x, y], index) => {
        const point = projectPerspectivePoint({ x: x!, y: y! }, bounds, transform, 1);
        return `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ') + ' Z';
  return {
    screen: path(22, 16, 76, 50),
    bar: path(22, 16, 76, 9),
    sidebar: path(27, 30, 14, 29),
    content: path(46, 31, 44, 16),
    line: path(46, 52, 32, 3),
  };
});
</script>

<template>
  <svg class="tilt-preview" :class="{ compact }" viewBox="0 0 120 84" aria-hidden="true" focusable="false">
    <path :d="geometry.screen" class="screen" />
    <path :d="geometry.bar" class="bar" />
    <path :d="geometry.sidebar" class="sidebar" />
    <path :d="geometry.content" class="content" />
    <path :d="geometry.line" class="line" />
    <path :d="geometry.screen" class="outline" />
  </svg>
</template>

<style scoped>
.tilt-preview {
  display: block;
  width: 34px;
  height: 24px;
}
.screen {
  fill: var(--color-bg-element);
}
.tilt-preview.compact {
  width: 26px;
  height: 18px;
}
.outline {
  fill: none;
  stroke: var(--text-secondary);
  stroke-width: 1.25;
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.bar,
.sidebar {
  fill: var(--color-bg-field-hover);
}
.content {
  fill: var(--color-primary);
  fill-opacity: 0.72;
}
.line {
  fill: var(--text-muted);
  fill-opacity: 0.45;
}
</style>
