<script setup lang="ts">
import { computed, useId } from 'vue';
import type { ClipTransition } from '~/media/shared/composition-types';
import {
  DEFAULT_TRANSITION_EASING_POWER,
  MAX_TRANSITION_EASING_POWER,
  MIN_TRANSITION_EASING_POWER,
} from '~/media/shared/clip-transitions';

const props = defineProps<{
  edge: 'entry' | 'exit';
  transition: ClipTransition;
}>();

const power = computed(() =>
  Math.max(
    MIN_TRANSITION_EASING_POWER,
    Math.min(MAX_TRANSITION_EASING_POWER, props.transition.easingPower ?? DEFAULT_TRANSITION_EASING_POWER),
  ),
);
const patternId = `transition-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
const points = computed(() =>
  Array.from({ length: 25 }, (_, index) => {
    const time = index / 24;
    const opacity = props.edge === 'entry' ? 1 - (1 - time) ** power.value : (1 - time) ** power.value;
    return { x: time * 100, y: 1 + (1 - opacity) * 22 };
  }),
);
const path = computed(() =>
  points.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' '),
);
const hatchedAreaPath = computed(() => {
  const curve = [...points.value]
    .reverse()
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  return `M 0 0 L 100 0 ${curve} Z`;
});
</script>

<template>
  <svg
    class="timeline-transition-curve"
    viewBox="0 0 100 24"
    preserveAspectRatio="none"
    aria-hidden="true"
    :data-edge="edge"
    :data-easing-power="power"
  >
    <defs>
      <pattern :id="patternId" width="6" height="6" patternUnits="userSpaceOnUse">
        <path class="hatch-line" d="M -1 6 L 6 -1 M 2 9 L 9 2" />
      </pattern>
    </defs>
    <path class="curve-hatched-area" :d="hatchedAreaPath" :fill="`url(#${patternId})`" />
    <path class="curve-contrast" :d="path" />
    <path class="curve-line" :d="path" />
  </svg>
</template>

<style scoped>
.timeline-transition-curve {
  position: absolute;
  z-index: 1;
  inset: 2px;
  width: calc(100% - 4px);
  height: calc(100% - 4px);
  overflow: visible;
  pointer-events: none;
  color: var(--color-primary);
}
.timeline-transition-curve path {
  vector-effect: non-scaling-stroke;
}
.curve-contrast {
  fill: none;
  stroke: color-mix(in srgb, var(--color-bg-surface) 88%, transparent);
  stroke-width: 2.75;
}
.curve-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25;
  opacity: 0.82;
}
.curve-hatched-area {
  opacity: 0.38;
}
.hatch-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 0.7;
}
</style>
