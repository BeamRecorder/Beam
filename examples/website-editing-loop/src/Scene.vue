<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  Clapperboard,
  Type,
  Scan,
  AudioLines,
  Magnet,
  Scissors,
  SkipBack,
  SkipForward,
  Play,
  Minus,
  Plus,
  Undo2,
} from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import TimelineTrimHandle from "../../../apps/desktop/src/components/editor/timeline/TimelineTrimHandle.vue";
import { timelineSurfacePalette } from "../../../apps/desktop/src/components/editor/timeline/timeline-surface-palette";
import { paintTimelineCanvas } from "../../../packages/runtime/src/timeline/timeline-canvas-paint";
import { clipDuration, lanes } from "./timeline-model";
import { px, FIRST_START, TRACK_WIDTH } from "./motion";
import type { DemoArtworks, DemoPose } from "./demo-types";
import artworkUrl from "../assets/beautiful-captures.webp";
import StaticGradient from "./StaticGradient.vue";
import DemoCursor from "./DemoCursor.vue";

const props = defineProps<{ pose: DemoPose }>();
const canvases = ref<HTMLCanvasElement[]>([]);
const image = new Image();
image.src = artworkUrl;
const icons = {
  titles: Type,
  screen: Clapperboard,
  zoom: Scan,
  audio: AudioLines,
};
const rows = computed(() => lanes(props.pose));
const duration = computed(() => clipDuration(props.pose));
const artworks: DemoArtworks = new Map();
const gripStyle = computed(() => ({
  width: `${px(duration.value)}px`,
  transform: `translate3d(${px(FIRST_START)}px,0,0)`,
  opacity: props.pose.trimActive,
}));
const cameraStyle = computed(() => ({
  transform: `translate3d(0,${-8 * props.pose.camera}px,0) scale(${1 + 0.055 * props.pose.camera})`,
}));

function paint() {
  if (!canvases.value.length) return;
  const palette = timelineSurfacePalette(canvases.value[0]!);
  rows.value.forEach((lane, index) => {
    const ctx = canvases.value[index]?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(2, 2);
    paintTimelineCanvas(
      ctx,
      lane.items,
      {
        durationMs: 10000,
        width: TRACK_WIDTH,
        left: 0,
        viewportWidth: TRACK_WIDTH,
        height: 30,
      },
      palette,
      artworks,
    );
    if (lane.id === "audio") {
      ctx.fillStyle = "#34c46f";
      for (let n = 0; n < 214; n++) {
        const envelope = 0.35 + 0.65 * Math.sin(n * 0.035) ** 2;
        const height =
          2 +
          (2 + 10 * Math.abs(Math.sin(n * 1.7) * Math.cos(n * 0.21))) *
            envelope;
        ctx.fillRect(4 + n * 2, 15 - height / 2, 1.15, height);
      }
    }
    ctx.restore();
  });
}
onMounted(async () => {
  await image.decode();
  for (const id of ["screen-intro", "screen-outro"])
    artworks.set(id, { kind: "image", source: image });
  paint();
});
watch(
  () => [
    props.pose.trim,
    props.pose.move,
    props.pose.trimActive,
    props.pose.moveActive,
  ],
  paint,
  { flush: "post" },
);
defineExpose({ paint });
</script>

<template>
  <div class="design-stage">
    <StaticGradient />
    <div class="world" :style="cameraStyle">
      <div class="editor-card">
        <div class="project-bar">
          <Clapperboard :size="13" /><span>Beautiful Captures</span
          ><span class="project-format">1920 × 1080</span>
        </div>
        <div class="preview-well">
          <img :src="artworkUrl" alt="Beam Beautiful Captures composition" />
          <div class="preview-grid" />
        </div>
        <div class="playback-bar">
          <div class="tool-set">
            <Button
              variant="ghost"
              size="xs"
              :icon="Scissors"
              icon-only
              aria-label="Split"
            /><Button
              variant="selected"
              size="xs"
              :icon="Magnet"
              icon-only
              aria-label="Snapping"
            /><Button
              variant="ghost"
              size="xs"
              :icon="Undo2"
              icon-only
              aria-label="Undo"
            />
          </div>
          <div class="tool-set">
            <Button
              variant="ghost"
              size="xs"
              :icon="SkipBack"
              icon-only
              aria-label="Go to start"
            /><Button
              variant="selected"
              size="xs"
              :icon="Play"
              icon-only
              aria-label="Play"
            /><Button
              variant="ghost"
              size="xs"
              :icon="SkipForward"
              icon-only
              aria-label="Go to end"
            /><span class="time-display">00:03 <span>/ 00:10</span></span>
          </div>
          <div class="tool-set">
            <Minus :size="12" /><span class="zoom-level">100%</span
            ><Plus :size="12" />
          </div>
        </div>
        <div class="timeline-root">
          <div class="ruler">
            <span class="ruler-spacer" />
            <div class="ruler-ticks">
              <span
                v-for="n in 11"
                :key="n"
                data-layout-allow-occlusion="true"
                :style="{ left: `${(n - 1) * 10}%` }"
                >{{ String(n - 1).padStart(2, "0") }}s</span
              >
            </div>
          </div>
          <div v-for="(row, index) in rows" :key="row.id" class="track-row">
            <div class="track-header">
              <component :is="icons[row.id]" :size="12" /><span>{{
                row.title
              }}</span>
            </div>
            <div class="track-body">
              <canvas
                :ref="
                  (el) => {
                    if (el) canvases[index] = el as HTMLCanvasElement;
                  }
                "
                :width="TRACK_WIDTH * 2"
                :height="60"
              />
              <div
                v-if="row.id === 'screen'"
                class="native-grip"
                data-layout-allow-overflow="true"
                :style="gripStyle"
              >
                <TimelineTrimHandle
                  class="demo-trim-handle"
                  data-layout-allow-overflow="true"
                  edge="end"
                  title="Trim clip end"
                  :state="{ edge: 'end', durationMs: duration, atLimit: false }"
                />
              </div>
            </div>
          </div>
          <div class="playhead">
            <svg width="12" height="14" viewBox="0 0 12 14">
              <path d="M1 1h10v7l-5 5-5-5z" fill="currentColor" />
            </svg>
          </div>
          <div class="snap-guide" :style="{ opacity: pose.snapOpacity }">
            <span>Snap</span>
          </div>
        </div>
      </div>
      <DemoCursor :pose="pose" />
    </div>
  </div>
</template>
