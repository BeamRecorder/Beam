<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import KeyboardChip from "../../../apps/desktop/src/components/ui/Kbd/KeyboardChip.vue";
import { Clapperboard, Camera, Scan, Type } from "@lucide/vue";
import TimelineToolbar from "../../../apps/desktop/src/components/editor/timeline/TimelineToolbar.vue";
import TimelineTrimHandle from "../../../apps/desktop/src/components/editor/timeline/TimelineTrimHandle.vue";
import TimelineGapButtons from "../../../apps/desktop/src/components/editor/timeline/TimelineGapButtons.vue";
import { timelineSurfacePalette } from "../../../apps/desktop/src/components/editor/timeline/timeline-surface-palette";
import { paintTimelineCanvas } from "../../../packages/runtime/src/timeline/timeline-canvas-paint";
import type {
  TimelineCanvasArtwork,
  TimelineCanvasItem,
} from "../../../packages/runtime/src/timeline/timeline-canvas-types";
import { selectedScreen, stateAt, TRACK_WIDTH, zoomsAt } from "./scene-model";
import { phaseTime, stageAt } from "./motion";
import { decodeVideo } from "./video";
import type { Pose } from "./demo-types";
import screenUrl from "../assets/screen-recording.mp4";
import webcamUrl from "../assets/demo-webcam.mp4";
const props = defineProps<{ pose: Pose }>();
const canvases = ref<HTMLCanvasElement[]>([]);
const state = computed(() => stateAt(props.pose.time));
const screenClips = computed(() =>
  state.value.composition.clips.filter((clip) => clip.kind === "screen"),
);
const duration = computed(
  () =>
    Math.max(
      ...state.value.composition.clips.map(
        (clip) => clip.timelineStartMs + clip.timelineDurationMs,
      ),
    ) / 1000,
);
const rows = computed(() => [
  {
    id: "caption",
    title: "Caption",
    icon: Type,
    items: state.value.composition.clips
      .filter((clip) => clip.kind === "caption")
      .map((clip) => ({ clip, selected: state.value.mode === "caption" })),
  },
  {
    id: "camera",
    title: "Camera",
    icon: Camera,
    items: state.value.composition.clips
      .filter((clip) => clip.kind === "webcam")
      .map((clip) => ({ clip, selected: false })),
  },
  {
    id: "screen",
    title: "Recording",
    icon: Clapperboard,
    items: screenClips.value.map((clip) => ({
      clip,
      selected:
        stageAt(props.pose.time) !== "deleted" &&
        clip.id === selectedScreen(props.pose.time).id &&
        (state.value.mode === "clip" ||
          state.value.mode === "shadow" ||
          state.value.mode === "size"),
    })),
  },
  {
    id: "zoom",
    title: "Zoom",
    icon: Scan,
    items: zoomsAt(props.pose.time).map((zoom) => ({
      zoom,
      label: "2D zoom",
      selected: false,
    })),
  },
]);
const thumbnails = new Map<string, TimelineCanvasArtwork>();
const images = new Map<string, HTMLImageElement>();
async function loadThumbnail(url: string, kind: string) {
  const video = await decodeVideo(url);
  try {
    const source = await video.frame(0.65),
      canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 100;
    canvas.getContext("2d")!.drawImage(source, 0, 0, 180, 100);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    await image.decode();
    images.set(kind, image);
  } finally {
    video.dispose();
  }
}
function paint() {
  const palette = timelineSurfacePalette(canvases.value[0]!);
  for (const clip of state.value.composition.clips)
    if (images.has(clip.kind))
      thumbnails.set(clip.id, {
        kind: "image",
        source: images.get(clip.kind)!,
      });
  rows.value.forEach((row, index) => {
    const ctx = canvases.value[index]!.getContext("2d")!;
    ctx.save();
    ctx.scale(2, 2);
    paintTimelineCanvas(
      ctx,
      row.items as TimelineCanvasItem[],
      {
        durationMs: 12000,
        width: TRACK_WIDTH,
        left: 0,
        viewportWidth: TRACK_WIDTH,
        height: 32,
      },
      palette,
      thumbnails,
    );
    ctx.restore();
  });
}
const trim = computed(
  () => phaseTime(props.pose.time) >= 0.8 && phaseTime(props.pose.time) < 1.75,
);
const grip = computed(() => ({
  width: `${(screenClips.value[0]!.timelineDurationMs / 12000) * TRACK_WIDTH}px`,
}));
const ready = (async () => {
  await nextTick();
  await Promise.all([
    loadThumbnail(screenUrl, "screen"),
    loadThumbnail(webcamUrl, "webcam"),
  ]);
  paint();
})();
defineExpose({ ready, paint });
</script>
<template>
  <div class="studio-timeline">
    <TimelineToolbar
      :current-time="state.previewTime"
      :duration="duration"
      :is-playing="state.playing"
      :zoom-level="100"
      :can-split="true"
      :can-undo="phaseTime(pose.time) > 1.7"
      :can-redo="false"
      :is-snapping-enabled="true"
    />
    <div
      v-if="phaseTime(pose.time) >= 2.78 && phaseTime(pose.time) < 3.08"
      class="delete-cue"
      aria-hidden="true"
    >
      <KeyboardChip :keys="['Backspace']" />
    </div>
    <div class="timeline-root">
      <div class="ruler">
        <span class="ruler-spacer" />
        <div class="ruler-ticks">
          <span
            v-for="n in 13"
            :key="n"
            :style="{ left: `${((n - 1) / 12) * 100}%` }"
            data-layout-allow-overflow="true"
            >{{ String(n - 1).padStart(2, "0") }}s</span
          >
        </div>
      </div>
      <div v-for="(row, index) in rows" :key="row.id" class="track-row">
        <div class="track-header">
          <component :is="row.icon" :size="14" /><span>{{ row.title }}</span>
        </div>
        <div class="track-body" :data-track="row.id">
          <canvas
            :ref="
              (el) => {
                if (el) canvases[index] = el as HTMLCanvasElement;
              }
            "
            :width="TRACK_WIDTH * 2"
            height="64"
          />
          <div
            v-if="row.id === 'screen' && trim"
            class="native-grip"
            :style="grip"
            data-layout-allow-overflow="true"
          >
            <TimelineTrimHandle
              edge="end"
              title="Trim recording end"
              :state="{
                edge: 'end',
                durationMs: screenClips[0]!.timelineDurationMs,
                atLimit: false,
              }"
            />
          </div>
          <TimelineGapButtons
            v-if="row.id === 'screen' && stageAt(pose.time) === 'deleted'"
            :clips="screenClips"
            :composition="state.composition"
            :duration-ms="12000"
            :width-px="TRACK_WIDTH"
            :moving="false"
          />
        </div>
      </div>
      <div
        class="playhead"
        :style="{ left: `${120 + (state.previewTime / 12) * TRACK_WIDTH}px` }"
        aria-hidden="true"
      >
        <span class="playhead-head" />
      </div>
    </div>
  </div>
</template>
<style scoped>
.studio-timeline {
  --text-muted: var(--text-secondary);
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 204px;
  background: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
}
.delete-cue {
  position: absolute;
  left: 459px;
  top: 11px;
  z-index: 10;
}
.timeline-root {
  position: relative;
  height: 152px;
  --timeline-trim-width: 9px;
  --timeline-trim-opacity: 1;
  --timeline-trim-pointer-events: none;
}
.ruler {
  height: 24px;
  display: flex;
  color: var(--text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.ruler-spacer {
  width: 120px;
  flex: none;
}
.ruler-ticks {
  position: relative;
  width: 1088px;
  height: 24px;
  border-bottom: 1px solid var(--color-border);
}
.ruler-ticks span {
  position: absolute;
  top: 5px;
  transform: translateX(-50%);
}
.track-row {
  height: 32px;
  display: flex;
}
.track-header {
  width: 120px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 16px;
  color: var(--text-secondary);
  font-size: 11px;
}
.track-body {
  position: relative;
  width: 1088px;
  height: 32px;
}
canvas {
  display: block;
  width: 1088px;
  height: 32px;
}
.native-grip {
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
}
.playhead {
  position: absolute;
  top: 4px;
  bottom: 0;
  width: 1px;
  background: var(--color-primary);
  z-index: 30;
  pointer-events: none;
}
.playhead-head {
  position: absolute;
  left: -5px;
  top: 0;
  width: 11px;
  height: 13px;
  border-radius: 3px 3px 0 0;
  clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);
  background: var(--color-primary);
}
</style>
