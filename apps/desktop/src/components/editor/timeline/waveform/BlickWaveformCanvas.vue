<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import { acquireBlickWaveformWorker } from './blick-waveform-worker-client';
import type {
  BlickWaveformCanvasProps,
  BlickWaveformPresentation,
  BlickWaveformWorkerRenderer,
} from './blick-waveform-types';

const props = defineProps<BlickWaveformCanvasProps>();
const { t } = useTranslate('TimelineTracks');
const container = ref<HTMLDivElement | null>(null);
const layers = ref<HTMLDivElement[]>([]);
const canvases = ref<HTMLCanvasElement[]>([]);
const current = ref(0);
const error = ref('');
const painted = ref<BlickWaveformPresentation[]>([
  { leftPercent: 0, widthPercent: 100, loadingSegments: [] },
  { leftPercent: 0, widthPercent: 100, loadingSegments: [] },
]);
let renderer: BlickWaveformWorkerRenderer | undefined;
let resizeObserver: ResizeObserver | undefined;
let animationFrame = 0;
let mounted = false;
let hasPainted = false;
let queuedDraw = false;
let animations: Animation[] = [];
let motionQuery: MediaQueryList | undefined;

const releasePreviousBitmap = () => {
  const previous = 1 - current.value;
  const element = canvases.value[previous];
  if (element) element.width = element.height = 1;
  painted.value[previous]!.loadingSegments = [];
};
const finishTransition = () => {
  for (const animation of animations) {
    animation.onfinish = null;
    animation.cancel();
  }
  animations = [];
  releasePreviousBitmap();
  if (queuedDraw) {
    queuedDraw = false;
    scheduleDraw();
  }
};
const onMotionChange = () => {
  if (motionQuery?.matches) finishTransition();
};

let drawGeneration = 0;
const draw = async () => {
  animationFrame = 0;
  if (!mounted || !container.value || props.deferDraw) return;
  // Finish the visible blend before committing the latest queued refinement.
  if (animations.length) {
    queuedDraw = true;
    return;
  }
  const previous = current.value;
  const next = hasPainted ? 1 - previous : previous;
  const element = canvases.value[next];
  if (!element) return;
  const bounds = container.value.getBoundingClientRect();
  const widthPercent = props.widthPercent ?? 100;
  const width = (bounds.width * widthPercent) / 100;
  const height = bounds.height;
  if (width <= 0 || height <= 0) return;
  const generation = ++drawGeneration;
  const presentation = {
    leftPercent: props.leftPercent ?? 0,
    widthPercent,
    loadingSegments: props.loadingSegments,
  };
  try {
    renderer ??= acquireBlickWaveformWorker();
    if (!(await renderer.draw(element, props, width, height))) return;
    if (!mounted || generation !== drawGeneration || props.deferDraw) return;
    const crossfade =
      hasPainted &&
      props.bars.length > 0 &&
      !motionQuery?.matches &&
      !painted.value[previous]!.loadingSegments.length &&
      !props.loadingSegments.length;
    // Publish geometry and pending regions only after the hidden bitmap is ready.
    painted.value[next] = presentation;
    current.value = next;
    hasPainted = props.bars.length > 0;
    error.value = '';
    if (crossfade) {
      const timing = {
        duration: 160,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      } as const;
      animations = [
        layers.value[next]!.animate([{ opacity: 0 }, { opacity: 1 }], timing),
        layers.value[previous]!.animate([{ opacity: 1 }, { opacity: 0 }], timing),
      ];
      animations[1]!.onfinish = finishTransition;
    } else releasePreviousBitmap();
  } catch (cause) {
    if (!mounted || generation !== drawGeneration) return;
    error.value = cause instanceof Error ? cause.message : 'The audio waveform could not be rendered.';
    console.error('[Beam media:waveform]', cause);
  }
};

const scheduleDraw = () => {
  if (!mounted || props.deferDraw || animationFrame) return;
  if (animations.length) {
    queuedDraw = true;
    return;
  }
  animationFrame = requestAnimationFrame(draw);
};
watch(
  [
    () => props.bars,
    () => props.bands,
    () => props.sourceDurationSeconds,
    () => props.loadingSegments,
    () => props.leftPercent,
    () => props.widthPercent,
  ],
  scheduleDraw,
);
watch(
  () => props.deferDraw,
  (deferred) => {
    if (deferred) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else scheduleDraw();
  },
);
onMounted(() => {
  mounted = true;
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', onMotionChange);
  resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(container.value!);
  scheduleDraw();
});
onUnmounted(() => {
  mounted = false;
  ++drawGeneration;
  finishTransition();
  motionQuery?.removeEventListener('change', onMotionChange);
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  renderer?.dispose();
});
</script>

<template>
  <div ref="container" class="blick-waveform">
    <div
      v-for="(presentation, index) in painted"
      :key="index"
      ref="layers"
      class="blick-waveform-layer"
      :class="{ 'blick-waveform-current': index === current }"
      :style="{
        left: `${presentation.leftPercent}%`,
        width: `${presentation.widthPercent}%`,
      }"
    >
      <canvas ref="canvases" class="blick-waveform-canvas" />
      <span
        v-for="(segment, segmentIndex) in presentation.loadingSegments"
        :key="segmentIndex"
        class="waveform-segment-loading"
        :style="{
          left: `${segment.leftPercent}%`,
          width: `${segment.widthPercent}%`,
        }"
      />
    </div>
    <span v-if="error" class="waveform-error" :title="error">{{ t('waveformUnavailable') }}</span>
  </div>
</template>

<style scoped>
.blick-waveform {
  position: relative;
  isolation: isolate;
  display: block;
  width: 100%;
  height: 100%;
}
.blick-waveform-layer {
  position: absolute;
  top: 0;
  height: 100%;
  opacity: 0;
  /* Complementary opacities keep shared pixels steady throughout the blend. */
  mix-blend-mode: plus-lighter;
}
.blick-waveform-current {
  opacity: 1;
}
.blick-waveform-canvas {
  display: block;
  width: 100%;
  height: 100%;
  filter: var(--timeline-waveform-filter);
}
.waveform-segment-loading {
  position: absolute;
  inset-block: 0;
  background: rgba(0, 0, 0, 0.2);
  border-inline: 1px solid var(--color-border-strong);
  pointer-events: none;
}
.waveform-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 9px;
}
</style>
