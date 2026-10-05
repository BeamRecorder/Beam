<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Mic, AudioLines, Captions, Clapperboard } from "@lucide/vue";
import { createDefaultClipAppearance } from "../../../packages/engine/src/shared/composition-defaults";
import { paintTimelineCanvas } from "../../../packages/runtime/src/timeline/timeline-canvas-paint";
import { timelineSurfacePalette } from "../../../apps/desktop/src/components/editor/timeline/timeline-surface-palette";
import WaveformCanvas from "../../../apps/desktop/src/components/editor/timeline/waveform/WaveformCanvas.vue";
import type {
  AudioClip,
  VisualClip,
} from "@beam/engine/shared/composition-types";
import type { TimelineCanvasItem } from "@beam/runtime/timeline/timeline-canvas-types";
import { captionClip, SENTENCES } from "./captions";
import { audioState, captionState } from "./motion";
import type { DemoMode, Pose } from "./demo-types";
import waveform from "../assets/waveform.json";
import artworkUrl from "../assets/beautiful-captures.webp";

const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const canvases = ref<HTMLCanvasElement[]>([]);
const image = new Image();
image.src = artworkUrl;
const base = {
  enabled: true,
  order: 0,
  timelineStartMs: 0,
  timelineDurationMs: 8000,
  sourceInMs: 0,
  sourceDurationMs: 8000,
  playbackRate: 1,
};
const audio = (id: string, name: string): AudioClip => ({
  ...base,
  id,
  name,
  kind: "audio",
  assetId: id,
  role:
    id === "voice" ? "voiceover" : id === "system" ? "system" : "microphone",
  volume: 100,
});
const screen: VisualClip = {
  ...base,
  id: "screen",
  name: "Beautiful Captures",
  kind: "screen",
  assetId: "capture",
  transform: { x: 0, y: 0, width: 1, height: 1 },
  appearance: createDefaultClipAppearance("screen"),
  isMirrored: false,
  isMirroredY: false,
};
const state = computed(() =>
  props.mode === "captions"
    ? captionState(props.pose.time)
    : audioState(props.pose.time),
);
const rows = computed(() =>
  props.mode === "captions"
    ? [
        {
          id: "screen",
          label: "Screen",
          icon: Clapperboard,
          items: [{ clip: screen, selected: false }],
        },
        {
          id: "captions",
          label: "Captions",
          icon: Captions,
          items: captionState(props.pose.time).generated
            ? SENTENCES.map((sentence, index) => ({
                clip: {
                  ...captionClip(props.pose.time),
                  id: `caption-${index}`,
                  name: sentence.text,
                  timelineStartMs: sentence.start,
                  timelineDurationMs: sentence.end - sentence.start,
                },
                selected: captionState(props.pose.time).styling,
              }))
            : [],
        },
        {
          id: "microphone",
          label: "Microphone",
          icon: Mic,
          items: [
            {
              clip: audio("microphone", "Microphone"),
              selected: false,
              label: "",
            },
          ],
        },
      ]
    : [
        {
          id: "system",
          label: "System",
          icon: AudioLines,
          items: [
            {
              clip: audio("system", "System audio"),
              selected: false,
              label: "",
            },
          ],
        },
        {
          id: "microphone",
          label: "Microphone",
          icon: Mic,
          items: [
            {
              clip: audio("microphone", "Microphone"),
              selected: false,
              label: "",
            },
          ],
        },
        {
          id: "voice",
          label: "Voiceover",
          icon: Mic,
          items: audioState(props.pose.time).recorded
            ? [
                {
                  clip: {
                    ...audio("voice", "Voiceover"),
                    timelineStartMs: 600,
                    timelineDurationMs: waveform.duration * 1000,
                    sourceDurationMs: waveform.duration * 1000,
                  },
                  selected: audioState(props.pose.time).selected,
                  label: "",
                },
              ]
            : [],
        },
      ],
);
function paint() {
  const palette = timelineSurfacePalette(canvases.value[0]!);
  rows.value.forEach((row, index) => {
    const context = canvases.value[index]!.getContext("2d")!;
    context.setTransform(2, 0, 0, 2, 0, 0);
    paintTimelineCanvas(
      context,
      row.items as TimelineCanvasItem[],
      { durationMs: 8000, width: 272, left: 0, viewportWidth: 272, height: 21 },
      palette,
      new Map([["screen", { kind: "image", source: image }]]),
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
      <div
        class="track-body"
        :data-target="row.id === 'voice' ? 'voiceover' : undefined"
      >
        <canvas
          :ref="
            (el) => {
              if (el) canvases[index] = el as HTMLCanvasElement;
            }
          "
          width="544"
          height="42"
        />
        <div
          v-if="
            ['system', 'microphone'].includes(row.id) ||
            (row.id === 'voice' && audioState(pose.time).recorded)
          "
          class="track-waveform"
          :style="
            row.id === 'voice'
              ? {
                  left: '28px',
                  right: `${272 - ((600 + waveform.duration * 1000) / 8000) * 272 + 8}px`,
                }
              : undefined
          "
        >
          <WaveformCanvas
            :selected="false"
            :bars="row.id === 'system' ? waveform.systemBars : waveform.bars"
          />
        </div>
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
