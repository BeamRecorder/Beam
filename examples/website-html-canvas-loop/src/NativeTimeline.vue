<script setup lang="ts">
import { computed, onMounted, onScopeDispose, reactive, ref, shallowRef } from 'vue';
import { createBrowserTimelineFrameQueue } from '../../../packages/runtime/src/timeline/browser-frame-queue';
import { useTimelineSurface } from '../../../apps/desktop/src/components/editor/timeline/composables/useTimelineSurface';
import TimelineSurfaceCanvas from '../../../apps/desktop/src/components/editor/timeline/TimelineSurfaceCanvas.vue';
import TimelineCanvasLane from '../../../apps/desktop/src/components/editor/timeline/TimelineCanvasLane.vue';
import TimelineTrackHeaders from '../../../apps/desktop/src/components/editor/timeline/TimelineTrackHeaders.vue';
import TimelineZoomTrack from '../../../apps/desktop/src/components/editor/timeline/TimelineZoomTrack.vue';
import TimelineTrimHandle from '../../../apps/desktop/src/components/editor/timeline/TimelineTrimHandle.vue';
import TimelineAddMenu from '../../../apps/desktop/src/components/editor/timeline/TimelineAddMenu.vue';
import {
  timelineClipStyle,
  timelineSpanStyle,
} from '../../../apps/desktop/src/components/editor/timeline/timeline-clip-geometry';
import { ZOOM_DEPTH_SCALES } from '../../../packages/engine/src/zoom/zoom-types';
import type { ZoomElement } from '../../../packages/engine/src/zoom/zoom-types';
import type { ClipComposition, VisualClip } from '../../../packages/engine/src/shared/composition-types';
import type { TimelineCanvasArtwork } from '../../../packages/runtime/src/timeline/timeline-canvas-types';

const props = defineProps<{
  currentTime: number;
  zooms: ZoomElement[];
  selectedZoom: string;
  composition: ClipComposition;
}>();
const scroll = ref<HTMLDivElement | null>(null);
const width = ref(1048);
const viewport = reactive({ left: 0, top: 0, width: 1048, height: 144 });
const frames = createBrowserTimelineFrameQueue();
useTimelineSurface(scroll, frames);
onScopeDispose(frames.dispose);
const clip = props.composition.clips[0] as VisualClip;
const tracks = [{ id: clip.id, clips: [clip], representative: clip, order: 0 }];
const items = computed(() => [{ clip, selected: true }]);
const artworks = shallowRef<ReadonlyMap<string, TimelineCanvasArtwork>>(new Map());
const sources = import.meta.glob('../assets/thumbnails/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const ready = Promise.all(
  Object.entries(sources)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(async ([path, url]) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const second = Number(path.match(/(\d+)\.png$/)![1]) / 5;
      return {
        timelineSecond: second,
        mediaSecond: second,
        relativeMs: second * 1000,
        durationMs: 2000,
        source: image,
        pending: false,
      };
    }),
).then((values) => {
  artworks.value = new Map([[clip.id, { kind: 'thumbnails', frames: values }]]);
});
let resize: ResizeObserver;
onMounted(() => {
  resize = new ResizeObserver(() => {
    width.value = scroll.value!.clientWidth;
    viewport.width = width.value;
  });
  resize.observe(scroll.value!);
});
onScopeDispose(() => resize?.disconnect());
// This film uses the live editor's presentation primitives and CSS. Its controls
// are inert; authored state and native cameras are driven by the movie clock.
const inertControl = () => {};
const zoomProps = computed(() => ({
  zoomElements: props.zooms,
  selectedZoomIdSet: new Set([props.selectedZoom]),
  hoverZoomTimeMs: null,
  hoverZoomDurationMs: 1000,
  layoutDurationMs: 12000,
  rulerLayoutWidth: width.value,
  viewport,
  percentageStyle: (start: number, duration: number) => timelineSpanStyle(start, duration, 12, width.value),
  displayedZoom: (zoom: ZoomElement) => zoom,
  trimStateFor: () => null,
  zoomScale: (depth: number) => ZOOM_DEPTH_SCALES[depth as keyof typeof ZOOM_DEPTH_SCALES],
  openTrackContextMenu: inertControl,
  hoverAt: inertControl,
  leaveTrack: inertControl,
  addAt: inertControl,
  selectItem: inertControl,
  openZoomContextMenu: inertControl,
  startZoomMove: inertControl,
  beginZoomTrim: inertControl,
}));
defineExpose({ ready });
</script>

<template>
  <div class="timeline-root" inert>
    <div class="timeline-sidebar">
      <div class="sidebar-ruler-spacer"><TimelineAddMenu /></div>
      <div class="sidebar-tracks-viewport">
        <div class="sidebar-tracks-stack">
          <TimelineTrackHeaders
            :visual-tracks="tracks"
            :zoom-elements="zooms"
            :keyboard-caption-clips="[]"
            :text-caption-layers="[]"
            :system-audio-clips="[]"
            :microphone-clips="[]"
            :voiceover-clips="[]"
            :has-voiceover-draft="false"
            :imported-audio-tracks="[]"
            :include-audio-in-export="false"
            :dragged-track-id="null"
            :dragged-caption-id="null"
            :selected-clip-ids="[clip.id]"
            :selected-zoom-ids="[selectedZoom]"
            :select-track="inertControl"
            :select-zoom-track="inertControl"
            :begin-reorder="inertControl"
            :begin-caption-reorder="inertControl"
            :open-track-context-menu="inertControl"
          />
        </div>
      </div>
    </div>
    <div ref="scroll" class="timeline-tracks-container">
      <div class="timeline-viewport" data-layout-allow-overflow="true" :style="{ width: `calc(100% + 230px)` }">
        <TimelineSurfaceCanvas />
        <div class="timeline-ruler">
          <div class="ruler-ticks-area">
            <div
              v-for="n in 13"
              :key="n"
              class="ruler-marker"
              :class="{ 'is-major': (n - 1) % 2 === 0 }"
              :style="{ transform: `translate3d(${((n - 1) / 12) * width}px,0,0)` }"
            >
              <span v-if="(n - 1) % 2 === 0" class="marker-label">{{ n - 1 }}s</span><span class="marker-tick" />
            </div>
          </div>
        </div>
        <div class="timeline-playhead-overlay">
          <div class="timeline-playhead" :style="{ transform: `translate3d(${(currentTime / 12) * width}px,0,0)` }">
            <div class="playhead-head">
              <svg width="12" height="15" viewBox="0 0 12 15" fill="var(--color-primary)">
                <path
                  d="M0 0H12V7.5C12 8.02701 11.7919 8.53272 11.4216 8.90566L6 14.5L0.57841 8.90566C0.20814 8.53272 0 8.02701 0 7.5V0Z"
                />
              </svg>
            </div>
          </div>
        </div>
        <div class="tracks-stack" style="--timeline-row-height: 48px">
          <div class="track-row visual-track">
            <div class="track-content visual-content">
              <TimelineCanvasLane
                :items="items"
                :duration-ms="12000"
                :width="width"
                :viewport="viewport"
                :artworks="artworks"
                :reduce-motion="true"
              />
              <div class="clip-target" :style="timelineClipStyle(clip, 12, width)">
                <TimelineTrimHandle edge="start" title="Trim start" /><TimelineTrimHandle edge="end" title="Trim end" />
              </div>
            </div>
          </div>
          <TimelineZoomTrack v-bind="zoomProps" />
          <div class="track-row annotation-track"><div class="track-content annotation-content" /></div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="../../../apps/desktop/src/components/editor/timeline/timeline-tracks.css"></style>
<style scoped>
.timeline-root {
  background: var(--color-bg-surface);
  border-radius: var(--radius-sm);
}
.sidebar-tracks-stack {
  height: 144px;
  min-height: 144px;
}
.tracks-stack {
  height: 144px;
  flex: none;
}
.track-row {
  height: 48px;
  flex: none;
}
.clip-target {
  position: absolute;
  inset-block: 0;
}
</style>
