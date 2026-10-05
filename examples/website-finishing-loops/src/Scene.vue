<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import {
  Clapperboard,
  Download,
  Layers,
  Monitor,
  Play,
  SkipBack,
  Type,
} from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import StaticGradient from "../../website-editing-loop/src/StaticGradient.vue";
import TransitionInspector from "./TransitionInspector.vue";
import ExportInspector from "./ExportInspector.vue";
import FinishingTimeline from "./FinishingTimeline.vue";
import DemoCursor from "./DemoCursor.vue";
import { contentOpacity, exportState, phaseTime } from "./motion";
import { paintPreview } from "./preview";
import type { DemoMode, DemoScene, Pose } from "./demo-types";
import tahoeUrl from "../assets/tahoe-light.webp";
import artworkUrl from "../assets/beautiful-captures.webp";
const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const preview = ref<HTMLCanvasElement | null>(null),
  timeline = ref<DemoScene | null>(null);
const clock = computed(() =>
  Math.floor(phaseTime(props.pose.time)).toString().padStart(2, "0"),
);
const image = new Image();
image.src = props.mode === "transitions" ? tahoeUrl : artworkUrl;
function paint() {
  if (!preview.value || !image.complete) return;
  // The authored cursor intentionally passes over the native labels it selects.
  document
    .querySelectorAll(
      "[data-target] .btn-content-label, .preset-card-info strong",
    )
    .forEach((label) =>
      label.setAttribute("data-layout-allow-occlusion", "true"),
    );
  paintPreview(preview.value, image, props.mode, props.pose.time);
  timeline.value?.paint();
}
const ready = (async () => {
  await nextTick();
  await Promise.all([image.decode(), timeline.value!.ready]);
  paint();
})();
defineExpose({ ready, paint });
</script>
<template>
  <div class="design-stage">
    <StaticGradient :preset-id="mode === 'transitions' ? 'aurora' : 'ember'" />
    <div class="world" :style="{ opacity: contentOpacity(pose.time) }">
      <div class="editor-card">
        <header class="project-bar">
          <Clapperboard :size="13" /><span>Beautiful Captures</span
          ><span class="project-format"
            ><Layers v-if="mode === 'transitions'" :size="12" />{{
              mode === "transitions" ? "Transitions" : "3840 × 2160"
            }}</span
          ><Button
            v-if="mode === 'export'"
            :icon="Download"
            size="xs"
            variant="primary"
            data-target="open-export"
            >Export</Button
          >
        </header>
        <main class="workspace">
          <section class="preview-area" aria-label="Composition preview">
            <canvas
              ref="preview"
              class="composition-preview"
              width="664"
              height="374"
            />
            <div class="preview-toolbar">
              <Button
                v-if="mode === 'transitions'"
                :icon="Type"
                size="xs"
                variant="secondary"
                data-target="text"
                >Text</Button
              ><span>{{
                mode === "transitions"
                  ? "Scene + editable elements"
                  : "Project and source media stay local"
              }}</span>
            </div>
          </section>
          <TransitionInspector v-if="mode === 'transitions'" :pose="pose" />
          <ExportInspector
            v-else-if="exportState(pose.time).open"
            :pose="pose"
          />
          <aside v-else class="inspector canvas-summary">
            <h2>Canvas</h2>
            <Monitor :size="36" /><strong>Beautiful Captures</strong>
            <p>3840 × 2160</p>
            <span>16:9 · Local project</span>
          </aside>
        </main>
        <div class="playback-bar">
          <span class="track-mode"><Clapperboard :size="12" />Studio</span>
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
        <FinishingTimeline ref="timeline" :mode="mode" :pose="pose" />
      </div>
      <DemoCursor :mode="mode" :time="pose.time" />
    </div>
  </div>
</template>
