<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { drawScreenshotZoom, disposeScreenshotZoom } from '../../../packages/runtime/src/screenshot/screenshot-zoom-render';
import { drawDecoratedMedia } from '../../../packages/runtime/src/composition/appearance/render-decorated-media';
import { createDefaultClipAppearance } from '../../../packages/engine/src/shared/composition-defaults';
import type { Canvas2DContext } from '../../../packages/runtime/src/canvas-types';
import StillZoomSelection from '../../../apps/desktop/src/components/screenshot/StillZoomSelection.vue';
import { CANVAS, PREVIEW, selectedZoom } from './scene-model';
import { phaseTime, styleAt } from './motion';
import type { Pose } from './demo-types';
import artworkUrl from '../assets/beautiful-captures.webp';
const props = defineProps<{ pose: Pose }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const zoom = computed(() => selectedZoom(props.pose.time));
const backdrop = document.createElement('canvas');
backdrop.width = CANVAS.width; backdrop.height = CANVAS.height;
const image = new Image(); image.src = artworkUrl;
const dark = document.documentElement.dataset.demoTheme === 'dark';
const appearance = { ...createDefaultClipAppearance('image'), frame: 'safari' as const,
  frameTitle: 'beam.plinka.eu', frameTheme: dark ? 'dark' as const : 'light' as const,
  frameColor: dark ? '#29292d' : '#f0f0f2', cornerRadius: 12, shadowSize: 'md' as const };
const moving = computed(() => {
  const t = phaseTime(props.pose.time);
  return styleAt(t) === 'glass' || (styleAt(t) === '2d' && t < 2.2);
});
function paint() {
  const target = canvas.value!.getContext('2d')!;
  const context = backdrop.getContext('2d')!;
  context.clearRect(0, 0, CANVAS.width, CANVAS.height);
  drawBase(context, CANVAS.width, CANVAS.height);
  target.clearRect(0, 0, CANVAS.width, CANVAS.height);
  target.drawImage(backdrop, 0, 0);
  drawScreenshotZoom(target, zoom.value, CANVAS, CANVAS.width, CANVAS.height, backdrop,
    { draw: drawBase, dispose() {} });
}
function drawBase(ctx: Canvas2DContext, width: number, height: number) {
  // A wider presentation of the 3D example leaves its projected corners in view.
  const fraction = styleAt(props.pose.time) === '3d' ? .48 : .76;
  const inset = (1 - fraction) / 2;
  drawDecoratedMedia(ctx, { source: image, title: 'Beautiful Captures',
    rect: { x: width * inset, y: height * inset, width: width * fraction, height: height * fraction }, appearance });
}
const ready = (async () => { await nextTick(); await image.decode(); paint(); })();
onBeforeUnmount(() => { if (canvas.value) disposeScreenshotZoom(canvas.value.getContext('2d')!); backdrop.width = 0; });
defineExpose({ ready, paint });
</script>
<template>
  <div class="preview-surface">
    <canvas ref="canvas" :width="CANVAS.width" :height="CANVAS.height" />
    <StillZoomSelection v-if="moving" :zoom="zoom" :canvas-size="CANVAS"
      :size="{ width: PREVIEW.width, height: PREVIEW.height }" :panning="false" />
  </div>
</template>
<style scoped>
.preview-surface { position: relative; width: 652px; height: 366.75px; }
canvas { display: block; width: 100%; height: 100%; border-radius: var(--radius-sm); }
</style>
