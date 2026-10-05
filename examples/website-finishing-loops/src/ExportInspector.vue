<script setup lang="ts">
import { computed } from "vue";
import { Check, Download, FolderOpen, FileVideo, HardDrive } from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import ButtonGroup from "../../../apps/desktop/src/components/ui/button/ButtonGroup.vue";
import ProgressBar from "../../../apps/desktop/src/components/ui/progressbar/ProgressBar.vue";
import { bitrateFor } from "../../../packages/encoder/src/export-presets";
import { exportState } from "./motion";
import type { Pose } from "./demo-types";
const props = defineProps<{ pose: Pose }>();
const state = computed(() => exportState(props.pose.time));
const dimensions = computed(() =>
  state.value.resolution === "max"
    ? { width: 3840, height: 2160 }
    : { width: 1920, height: 1080 },
);
const bitrate = computed(() =>
  (
    bitrateFor(
      state.value.preset,
      dimensions.value.width,
      dimensions.value.height,
      state.value.fps,
    ) / 1e6
  ).toFixed(1),
);
const fields = computed(() => [
  {
    label: "Format",
    selected: state.value.format,
    values: [
      { id: "webm", label: "WebM" },
      { id: "mp4", label: "MP4" },
    ],
  },
  {
    label: "Resolution",
    selected: state.value.resolution,
    values: [
      { id: "720p", label: "720p" },
      { id: "1080p", label: "1080p" },
      { id: "max", label: "Maximum", target: "resolution" },
    ],
  },
  {
    label: "Frame rate",
    selected: String(state.value.fps),
    values: [
      { id: "24", label: "24 fps" },
      { id: "30", label: "30 fps" },
      { id: "60", label: "60 fps", target: "fps" },
    ],
  },
  {
    label: "Quality & bitrate",
    selected: state.value.preset,
    values: [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High", target: "quality" },
    ],
  },
]);
</script>
<template>
  <aside class="inspector export-inspector">
    <h2>
      {{
        state.saved
          ? "Saved locally"
          : state.running
            ? "Exporting"
            : "Export video"
      }}
    </h2>
    <div class="destination">
      <FolderOpen :size="16" /><span
        >Exports<small>On this computer</small></span
      ><HardDrive :size="13" />
    </div>
    <div v-if="state.running || state.saved" class="export-progress">
      <div class="file-symbol">
        <component :is="state.saved ? Check : FileVideo" :size="28" />
      </div>
      <strong>Beautiful Captures.mp4</strong>
      <p>3840 × 2160 · 60 fps · MP4</p>
      <div class="progress-label">
        <span>{{ state.saved ? "Export complete" : "Encoding video" }}</span
        ><strong>{{ Math.round(state.progress) }}%</strong>
      </div>
      <ProgressBar :value="state.progress" />
      <Button
        v-if="state.saved"
        :icon="FolderOpen"
        block
        variant="secondary"
        size="sm"
        >Open file</Button
      >
      <Button v-else block variant="ghost" size="sm">Cancel export</Button>
      <p class="local-note">Your project and source media stay local.</p>
    </div>
    <template v-else>
      <div v-for="field in fields" :key="field.label" class="export-field">
        <span>{{ field.label }}</span>
        <ButtonGroup
          full
          size="xs"
          variant="neutral"
          :columns="field.values.length === 2 ? 2 : 3"
          :selection="{
            index: field.values.findIndex(
              (value) => value.id === field.selected,
            ),
            count: field.values.length,
          }"
        >
          <Button
            v-for="value in field.values"
            :key="value.id"
            size="xs"
            :variant="value.id === field.selected ? 'selected' : 'ghost'"
            :data-target="'target' in value ? value.target : value.id"
            >{{ value.label }}</Button
          >
        </ButtonGroup>
      </div>
      <div class="export-summary">
        <span>{{ dimensions.width }} × {{ dimensions.height }}</span
        ><span>{{ bitrate }} Mbps</span>
      </div>
      <Button
        :icon="Download"
        block
        size="xs"
        variant="primary"
        data-target="export-video"
        >Export video</Button
      >
    </template>
  </aside>
</template>
