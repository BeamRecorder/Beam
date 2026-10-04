<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  Clapperboard,
  Captions,
  AudioLines,
  Play,
  SkipBack,
  Mic,
  FileJson,
} from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import VoiceoverControlBar from "../../../apps/desktop/src/components/editor/voiceover/VoiceoverControlBar.vue";
import StaticGradient from "../../website-editing-loop/src/StaticGradient.vue";
import CaptionInspector from "./CaptionInspector.vue";
import AudioInspector from "./AudioInspector.vue";
import SpeechTimeline from "./SpeechTimeline.vue";
import DemoCursor from "./DemoCursor.vue";
import { paintCaption } from "./captions";
import { audioState, captionState, contentOpacity } from "./motion";
import type { DemoMode, DemoScene, Pose } from "./demo-types";
import waveform from "../assets/waveform.json";
import tahoeUrl from "../assets/tahoe-light.webp";
import artworkUrl from "../assets/beautiful-captures.webp";
const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const preview = ref<HTMLCanvasElement | null>(null),
  timeline = ref<DemoScene | null>(null);
const audio = computed(() => audioState(props.pose.time));
const clock = computed(() =>
  Math.floor(
    (props.mode === "audio"
      ? audio.value.playheadMs
      : captionState(props.pose.time).playheadMs) / 1000,
  )
    .toString()
    .padStart(2, "0"),
);
const recordingBars = computed(() => {
  const count = Math.floor(audio.value.recordProgress * waveform.bars.length);
  return audio.value.phase === "recording"
    ? waveform.bars.slice(Math.max(0, count - 64), count)
    : [];
});
let background: HTMLImageElement, artwork: HTMLImageElement;
function paint() {
  if (!preview.value || !background || !artwork) return;
  // The macOS pointer intentionally passes over these native action labels.
  // The layout auditor requires the waiver on the text, not its occluder.
  document
    .querySelectorAll(".voiceover-actions .btn-content-label")
    .forEach((label) =>
      label.setAttribute("data-layout-allow-occlusion", "true"),
    );
  const context = preview.value.getContext("2d")!;
  const { width, height } = preview.value;
  context.clearRect(0, 0, width, height);
  if (props.mode === "captions") {
    const scale = Math.max(
      width / background.naturalWidth,
      height / background.naturalHeight,
    );
    const w = width / scale,
      h = height / scale;
    context.drawImage(
      background,
      (background.naturalWidth - w) / 2,
      (background.naturalHeight - h) / 2,
      w,
      h,
      0,
      0,
      width,
      height,
    );
    const shade = context.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, "#00000015");
    shade.addColorStop(1, "#00000070");
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    paintCaption(context, props.pose.time);
  } else context.drawImage(artwork, 0, 0, width, height);
  timeline.value?.paint();
}
const ready = (async () => {
  await nextTick();
  background = new Image();
  background.src = tahoeUrl;
  artwork = new Image();
  artwork.src = artworkUrl;
  await Promise.all([
    background.decode(),
    artwork.decode(),
    timeline.value!.ready,
  ]);
  paint();
})();
defineExpose({ ready, paint });
</script>

<template>
  <div class="design-stage">
    <StaticGradient :preset-id="mode === 'captions' ? 'nocturne' : 'sunrise'" />
    <div class="world" :style="{ opacity: contentOpacity(pose.time) }">
      <div class="editor-card">
        <header class="project-bar">
          <Clapperboard :size="13" /><span>Beautiful Captures</span
          ><span class="project-format"
            ><component
              :is="mode === 'captions' ? Captions : AudioLines"
              :size="12"
            />{{ mode === "captions" ? "Captions" : "Audio" }}</span
          >
        </header>
        <main class="workspace">
          <section class="preview-area" aria-label="Composition preview">
            <canvas
              ref="preview"
              class="composition-preview"
              width="664"
              :height="mode === 'captions' ? 416 : 374"
            />
            <div v-if="mode === 'audio'" class="voiceover-bar">
              <VoiceoverControlBar
                :phase="audio.phase"
                :elapsed-label="`00:0${Math.floor(audio.recordProgress * waveform.duration)}`"
                :waveform-bars="recordingBars"
                start-label="Record"
                stop-label="Stop"
                pause-label="Pause"
                resume-label="Resume"
                discard-label="Discard"
                preparing-label="Preparing"
                :style="{
                  width: '100%',
                  gridTemplateColumns: '0 minmax(76px, 1fr) 43px auto',
                  gap: '6px',
                }"
                data-target="voiceover-controls"
              />
            </div>
            <div
              v-if="mode === 'captions' && captionState(pose.time).transcript"
              class="transcript-preview"
            >
              <FileJson :size="13" /><span>Transcript.json</span
              ><code>{{ '{ "text": "Created with Beam." }' }}</code>
            </div>
          </section>
          <CaptionInspector v-if="mode === 'captions'" :pose="pose" />
          <AudioInspector v-else :pose="pose" />
        </main>
        <div class="playback-bar">
          <span class="track-mode"
            ><component
              :is="mode === 'captions' ? Captions : Mic"
              :size="12"
            />{{ mode === "captions" ? "Captions" : "Voiceover" }}</span
          >
          <div class="playback-actions">
            <Button
              :icon="SkipBack"
              size="xs"
              variant="ghost"
              icon-only
              aria-label="Go to start"
            /><Button
              :icon="Play"
              size="xs"
              variant="ghost"
              icon-only
              aria-label="Play"
            /><span class="time-display"
              >00:{{ clock }} <span>/ 00:08</span></span
            >
          </div>
          <span class="project-format">100%</span>
        </div>
        <SpeechTimeline ref="timeline" :mode="mode" :pose="pose" />
      </div>
      <DemoCursor :mode="mode" :time="pose.time" />
    </div>
  </div>
</template>
