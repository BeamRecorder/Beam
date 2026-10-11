<script setup lang="ts">
import { nextTick, ref, computed } from 'vue';
import { Clapperboard, Focus, Layers } from '@lucide/vue';
import { paintTimelineCanvas } from '../../../packages/runtime/src/timeline/timeline-canvas-paint';
import { timelineSurfacePalette } from '../../../apps/desktop/src/components/editor/timeline/timeline-surface-palette';
import { ZOOM_DEPTH_SCALES } from '../../../packages/engine/src/zoom/zoom-types';
import { previewClip, zoomElements, selectedZoom } from './scene-model';
import { phaseTime } from './motion';
import type { DemoMode, Pose } from './demo-types';
import type { TimelineCanvasItem } from '@beam/runtime/timeline/timeline-canvas-types';
import artworkUrl from '../assets/beautiful-captures.webp';
const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const canvases = ref<HTMLCanvasElement[]>([]);
const image = new Image();
image.src = artworkUrl;
const rows = computed(() => [
  { id: 'scene', label: 'Scene', icon: Clapperboard, items: [{ clip: previewClip(), selected: false }] },
  {
    id: 'zoom',
    label: 'Zooms',
    icon: Focus,
    items: zoomElements(props.mode).map((zoom) => ({
      zoom,
      selected: zoom.id === selectedZoom(props.mode, props.pose.time).id,
      label: `${props.mode.toUpperCase()} · ${ZOOM_DEPTH_SCALES[zoom.depth]}×`,
    })),
  },
  { id: 'canvas', label: 'Canvas', icon: Layers, items: [] },
]);
function paint() {
  const palette = timelineSurfacePalette(canvases.value[0]!);
  rows.value.forEach((row, index) => {
    const ctx = canvases.value[index]!.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    paintTimelineCanvas(
      ctx,
      row.items as TimelineCanvasItem[],
      { durationMs: 8000, width: 272, left: 0, viewportWidth: 272, height: 21 },
      palette,
      new Map([['capture', { kind: 'image', source: image }]]),
    );
  });
}
const ready = (async () => {
  await nextTick();
  await image.decode();
  paint();
})();
defineExpose({ ready, paint });
</script>
<template>
  <div class="timeline">
    <div class="ruler">
      <span
        v-for="n in 5"
        :key="n"
        data-layout-allow-occlusion="true"
        :style="{ transform: `translate3d(${(n - 1) * 64}px,0,0)` }"
        >{{ (n - 1) * 2 }}s</span
      >
    </div>
    <div v-for="(row, index) in rows" :key="row.id" class="track-row">
      <div class="track-label">
        <component :is="row.icon" :size="11" /><span>{{ row.label }}</span>
      </div>
      <div class="track-body">
        <canvas
          :ref="
            (el) => {
              if (el) canvases[index] = el as HTMLCanvasElement;
            }
          "
          width="544"
          height="42"
        />
        <template v-if="row.id === 'zoom'">
          <span
            v-for="zoom in zoomElements(mode)"
            :key="zoom.id"
            :data-target="zoom.id"
            class="zoom-target"
            :style="{
              left: `${(zoom.startMs / 8000) * 272}px`,
              width: `${((zoom.endMs - zoom.startMs) / 8000) * 272}px`,
            }"
          />
        </template>
      </div>
    </div>
    <div class="playhead" :style="{ transform: `translate3d(${(phaseTime(pose.time) / 8) * 272}px,0,0)` }" />
  </div>
</template>
<style scoped>
.zoom-target {
  position: absolute;
  top: 0;
  height: 21px;
}
</style>
