<script setup lang="ts">
import type { AlignmentLine, AlignmentMeasurement } from '@beam/engine/layout/alignment-index-types';
defineProps<{ guides: AlignmentLine[]; measurements?: AlignmentMeasurement[] }>();
const styleFor = (guide: AlignmentLine) =>
  guide.type === 'vertical' ? { left: `${guide.position * 100}%` } : { top: `${guide.position * 100}%` };
const measureStyle = (m: AlignmentMeasurement) =>
  m.axis === 'x'
    ? { left: `${m.from * 100}%`, top: `${m.cross * 100}%`, width: `${(m.to - m.from) * 100}%` }
    : { left: `${m.cross * 100}%`, top: `${m.from * 100}%`, height: `${(m.to - m.from) * 100}%` };
const label = (pixels: number) => `${Number(pixels.toFixed(2))} px`;
</script>
<template>
  <div
    v-for="guide in guides"
    :key="`${guide.type}-${guide.position}`"
    class="screenshot-alignment-guide"
    :class="guide.type"
    :style="styleFor(guide)"
    aria-hidden="true"
  />
  <div
    v-for="(m, index) in measurements"
    :key="index"
    class="screenshot-measurement"
    :class="[m.axis, m.kind]"
    :style="measureStyle(m)"
    aria-hidden="true"
  >
    <span>{{ label(m.pixels) }}</span>
  </div>
</template>
<style scoped>
.screenshot-alignment-guide {
  position: absolute;
  z-index: 40;
  background: var(--color-primary);
  pointer-events: none;
}
.screenshot-alignment-guide.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}
.screenshot-alignment-guide.horizontal {
  right: 0;
  left: 0;
  height: 1px;
}
.screenshot-measurement {
  position: absolute;
  z-index: 41;
  color: var(--text-primary);
  pointer-events: none;
  font-size: var(--font-size-xs);
}
.screenshot-measurement.x {
  border-top: 1px solid var(--color-primary);
  height: 6px;
  border-left: 1px solid var(--color-primary);
  border-right: 1px solid var(--color-primary);
}
.screenshot-measurement.y {
  border-left: 1px solid var(--color-primary);
  width: 6px;
  border-top: 1px solid var(--color-primary);
  border-bottom: 1px solid var(--color-primary);
}
.screenshot-measurement span {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 2px 5px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--color-bg-surface) 92%, transparent);
  border: 1px solid var(--color-border);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
