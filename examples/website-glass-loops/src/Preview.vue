<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { renderGlassHighlights } from '../../../packages/runtime/src/rendering/glass-highlight-render';
import GlassHighlightSelection from '../../../apps/desktop/src/components/editor/canvas/GlassHighlightSelection.vue';
import { contour, lensesAt, manualLens, recordingCursor, sourceTime } from './scene-model';
import { stateAt } from './motion';
import type { DemoKind, Pose } from './demo-types';
import artwork from '../assets/beautiful-captures.webp';
import pointer from '../assets/figma-pointer.svg';
import frame0 from '../assets/recorded-frame-0.webp';
import frame1 from '../assets/recorded-frame-1.webp';
import frame2 from '../assets/recorded-frame-2.webp';
import frame3 from '../assets/recorded-frame-3.webp';
const props = defineProps<{ kind: DemoKind; pose: Pose }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const images = [artwork, frame0, frame1, frame2, frame3, pointer].map((src) => {
  const image = new Image(); image.src = src; return image;
});
const width = 1280, height = props.kind === 'glass' ? 720 : 680;
function paint() {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d')!;
  const time = props.pose.time, source = sourceTime(time);
  const frame = source < 2400 ? 1 : source < 4350 ? 2 : source < 7900 ? 3 : 4;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(images[props.kind === 'glass' ? 0 : frame]!, 0, 0, width, height);
  if (props.kind === 'automatic' && time >= 3.35 && time < 7.4) {
    const position = recordingCursor(source);
    ctx.drawImage(images[5]!, position.cx * width - 5, position.cy * height - 5, 38, 38);
  }
  renderGlassHighlights(ctx, { canvas: { preset: 'custom', width, height, showBackground: false }, zooms: lensesAt(props.kind, time) },
    props.kind === 'glass' ? 1000 : source);
}
const ready = (async () => { await nextTick(); await Promise.all(images.map((image) => image.decode())); paint(); })();
defineExpose({ ready, paint });
</script>
<template>
  <div class="preview-surface" :style="{ aspectRatio: `${width}/${height}` }">
    <canvas ref="canvas" :width="width" :height="height" />
    <GlassHighlightSelection v-if="kind === 'glass' && (pose.time < 1.8 || pose.time >= 3.45)"
      :zoom="manualLens(pose.time)" :canvas-size="{ width, height }"
      :viewport-style="{ left: '0', top: '0', width: '628px', height: `${height / width * 628}px` }" :panning="false" />
    <svg v-if="kind === 'glass' && pose.time >= 2.25 && pose.time < 3.45"
      class="drawing-trace" viewBox="0 0 1280 720" aria-hidden="true">
      <polyline :points="contour.slice(0, Math.max(2, Math.floor(stateAt(pose.time, kind).drawProgress * 65))).map(p => `${p.x * 1280},${p.y * 720}`).join(' ')" />
    </svg>
  </div>
</template>
<style scoped>
.preview-surface { position: relative; width: 628px; overflow: visible; }
canvas { display: block; width: 100%; height: 100%; border-radius: var(--radius-sm); }
.drawing-trace { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
polyline { fill: none; stroke: var(--color-primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
</style>
