<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Clapperboard, Focus } from '@lucide/vue';
import { paintTimelineCanvas } from '../../../packages/runtime/src/timeline/timeline-canvas-paint';
import { timelineSurfacePalette } from '../../../apps/desktop/src/components/editor/timeline/timeline-surface-palette';
import { ZOOM_DEPTH_SCALES } from '../../../packages/engine/src/zoom/zoom-types';
import { lensesAt, previewClip, sourceTime } from './scene-model';
import type { TimelineCanvasItem } from '@beam/runtime/timeline/timeline-canvas-types';
import type { DemoKind, Pose } from './demo-types';
import artwork from '../assets/beautiful-captures.webp';
import recording from '../assets/recorded-frame-0.webp';
const props = defineProps<{ kind: DemoKind; pose: Pose }>();
const canvases = ref<HTMLCanvasElement[]>([]), image = new Image();
image.src = props.kind === 'glass' ? artwork : recording;
const duration = props.kind === 'glass' ? 10000 : 8600;
const rows = computed(() => [
  { id: 'scene', label: 'Scene', icon: Clapperboard, items: [{ clip: previewClip(props.kind), selected: false }] },
  { id: 'zooms', label: 'Zooms', icon: Focus, items: lensesAt(props.kind, props.pose.time).map((zoom, index) => ({
    zoom, selected: props.kind === 'glass' || props.pose.time >= 7.4 && index === 0,
    label: `Loupe · ${ZOOM_DEPTH_SCALES[zoom.depth]}×`,
  })) },
]);
function paint() {
  const palette = timelineSurfacePalette(canvases.value[0]!);
  rows.value.forEach((row, index) => {
    const ctx = canvases.value[index]!.getContext('2d')!;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    paintTimelineCanvas(ctx, row.items as TimelineCanvasItem[],
      { durationMs: duration, width: 540, left: 0, viewportWidth: 540, height: 30 }, palette,
      new Map([['capture', { kind: 'image', source: image }]]));
  });
}
const ready = (async () => { await nextTick(); await image.decode(); paint(); })();
defineExpose({ ready, paint });
</script>
<template>
  <div class="timeline">
    <div class="ruler"><span v-for="n in 5" :key="n" :style="{ left: `${(n - 1) * 120}px` }">{{ (n - 1) * 2 }}s</span></div>
    <div v-for="(row, index) in rows" :key="row.id" class="track-row">
      <div class="track-label"><component :is="row.icon" :size="13" /><span>{{ row.label }}</span></div>
      <div class="track-body">
        <canvas :ref="el => { if (el) canvases[index] = el as HTMLCanvasElement; }" width="1080" height="60" />
        <button v-for="item in row.id === 'zooms' ? lensesAt(kind, pose.time) : []" :key="item.id"
          class="zoom-target" :data-target="item.id" aria-label="Select generated lens"
          :style="{ left: `${item.startMs / duration * 540}px`, width: `${(item.endMs-item.startMs) / duration * 540}px` }" />
      </div>
    </div>
    <div class="playhead" :style="{ transform: `translate3d(${(kind === 'glass' ? 1000 : sourceTime(pose.time)) / duration * 540}px,0,0)` }" />
  </div>
</template>
<style scoped>
.timeline { position: relative; height: 94px; padding-top: 5px; }
.ruler { position: relative; height: 19px; margin-left: 104px; font-size: 10px; color: var(--text-secondary); }
.ruler span { position: absolute; }
.track-row { display: flex; height: 31px; border-top: 1px solid var(--color-border); }
.track-label { width: 104px; display: flex; align-items: center; gap: 7px; padding-left: 14px; font-size: 11px; color: var(--text-secondary); }
.track-body { position: relative; width: 540px; height: 30px; }
canvas { width: 540px; height: 30px; display: block; }
.zoom-target { position: absolute; top: 0; height: 30px; background: transparent; border: 0; cursor: pointer; }
.playhead { position: absolute; left: 104px; top: 0; height: 86px; width: 1px; background: var(--color-primary); }
.playhead::before { content: ''; position: absolute; top: 0; left: -3px; width: 7px; height: 7px; border-radius: 2px; background: var(--color-primary); }
</style>
