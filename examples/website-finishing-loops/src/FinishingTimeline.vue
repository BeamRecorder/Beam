<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Clapperboard, Type, Layers } from "@lucide/vue";
import { paintTimelineCanvas } from "../../../packages/runtime/src/timeline/timeline-canvas-paint";
import { paintTimelineTransition } from "../../../packages/runtime/src/timeline/timeline-canvas-transition";
import { timelineSurfacePalette } from "../../../apps/desktop/src/components/editor/timeline/timeline-surface-palette";
import { elementClips, previewClip } from "./scene-model";
import { exportState, transitionState } from "./motion";
import type { DemoMode, Pose } from "./demo-types";
import artworkUrl from "../assets/beautiful-captures.webp";
import tahoeUrl from "../assets/tahoe-light.webp";
const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const canvases = ref<HTMLCanvasElement[]>([]);
const image = new Image();
image.src = props.mode === "transitions" ? tahoeUrl : artworkUrl;
const state = computed(() =>
  props.mode === "transitions"
    ? transitionState(props.pose.time)
    : exportState(props.pose.time),
);
const rows = computed(() => [
  {
    id: "scene",
    label: "Scene",
    icon: Clapperboard,
    items: [
      {
        clip:
          props.mode === "transitions"
            ? previewClip(props.pose.time)
            : previewClip(0),
        selected:
          props.mode === "transitions" &&
          !transitionState(props.pose.time).canvas,
      },
    ],
  },
  {
    id: "elements",
    label: "Elements",
    icon: Type,
    items:
      props.mode === "transitions"
        ? elementClips(props.pose.time).map((clip) => ({
            clip,
            selected: true,
          }))
        : [],
  },
  { id: "canvas", label: "Canvas", icon: Layers, items: [] },
]);
function paint() {
  const palette = timelineSurfacePalette(canvases.value[0]!);
  rows.value.forEach((row, index) => {
    const context = canvases.value[index]!.getContext("2d")!;
    context.setTransform(2, 0, 0, 2, 0, 0);
    paintTimelineCanvas(
      context,
      row.items,
      { durationMs: 8000, width: 272, left: 0, viewportWidth: 272, height: 21 },
      palette,
      new Map([["scene", { kind: "image", source: image }]]),
    );
    const transition = transitionState(props.pose.time);
    if (
      row.id === "canvas" &&
      props.mode === "transitions" &&
      transition.canvas
    ) {
      paintTimelineTransition(
        context,
        "entry",
        {
          preset: transition.preset,
          durationMs: transition.duration,
          easingPower: 3,
        },
        { x: 0, width: (transition.duration / 8000) * 272, height: 21 },
        palette,
      );
    }
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
      </div>
    </div>
    <div
      class="playhead"
      :style="{
        transform: `translate3d(${(state.playheadMs / 8000) * 272}px,0,0)`,
      }"
    />
  </div>
</template>
