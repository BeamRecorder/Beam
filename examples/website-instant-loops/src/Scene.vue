<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Film, Check, Monitor, ArrowDownToLine, Sparkles } from "@lucide/vue";
import CaptureModeGroup from "../../../apps/desktop/src/components/hud/CaptureModeGroup.vue";
import CapturePresetSelect from "../../../apps/desktop/src/components/hud/CapturePresetSelect.vue";
import RecorderBar from "../../../apps/desktop/src/components/hud/recorder/RecorderBar.vue";
import QuickSnipStatus from "../../../apps/desktop/src/components/quick-snip/QuickSnipStatus.vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import Preview from "./Preview.vue";
import DemoCursor from "./DemoCursor.vue";
import { contentOpacity, exportState, phaseTime, presetState } from "./motion";
import { setPreset, publishExport } from "./demo-capture";
import { mascotClock } from "./mascot-clock";
import type { DemoMode, Pose } from "./demo-types";
const props = defineProps<{ mode: Exclude<DemoMode, 'hero'>; pose: Pose }>();
const preset = computed(() => presetState(props.pose.time));
const exported = computed(() => exportState(props.pose.time));
const preview = ref<InstanceType<typeof Preview> | null>(null);
const captureMode = ref<"studio" | "screenshot" | "instant">("studio");
let thumbnail = "";
const open = ref(false);
let priorStopped = false;
const presetName = computed(() =>
  preset.value.presetId === "default"
    ? "Default"
    : preset.value.presetId === "nocturne"
      ? "Nocturne"
      : "Sunrise",
);
async function synchronize() {
  if (props.mode === "presets") {
    captureMode.value = preset.value.instant ? "instant" : "studio";
    setPreset(preset.value.presetId);
    await nextTick();
    if (open.value !== preset.value.open) {
      document
        .querySelector<HTMLButtonElement>(
          ".preset-control button.select-trigger",
        )
        ?.click();
      await nextTick();
    }
    if (preset.value.open) {
      await nextTick();
      const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
      const time = phaseTime(props.pose.time);
      const target = options[time >= 4.7 ? 2 : time >= 2.1 && time < 2.85 ? 1 : 0];
      if (target) {
        target.dispatchEvent(new PointerEvent('pointerenter'));
      } else document.querySelector('.virtual-scroll-container')?.dispatchEvent(new PointerEvent('pointerleave'));
      await nextTick();
      await nextTick();
      // Lazy native preview modules must finish painting before offline capture.
      for (let attempt = 0; attempt < 20; attempt++) {
        const sample = document.querySelector<HTMLElement>('.preset-preview-media canvas');
        if (sample && sample.style.display !== 'none') break;
        if (document.querySelector('.preset-preview-media')?.textContent?.includes('unavailable'))
          throw new Error('Native preset preview unavailable');
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }
  } else {
    if (exported.value.stopped && !priorStopped)
      document
        .querySelector<HTMLButtonElement>('button[aria-label="Stop recording"]')
        ?.click();
    priorStopped = exported.value.stopped;
    mascotClock.value = exported.value.mascotTime;
    publishExport(
      exported.value.renderTime,
      thumbnail,
      exported.value.completed,
      exported.value.progress,
    );
    await nextTick();
  }
  preview.value?.paint();
}
const ready = (async () => {
  await nextTick();
  await preview.value!.ready;
  thumbnail = preview.value!.thumbnail();
  await synchronize();
})();
defineExpose({ ready, synchronize });
</script>
<template>
  <div
    class="world"
    :style="{ opacity: contentOpacity(pose.time) }"
    :data-phase="
      mode === 'presets'
        ? presetName
        : exported.completed
          ? 'completed'
          : exported.stopped
            ? 'processing'
            : 'recording'
    "
  >
    <section class="product-card" :class="mode">
      <header class="project-header">
        <Film :size="14" /><strong>Beautiful Captures</strong
        ><span>Beam <span class="header-dot">·</span> Instant</span>
      </header>
      <template v-if="mode === 'presets'">
        <div class="preset-preview">
          <Preview
            ref="preview"
            :preset="preset.presetId"
            :time="phaseTime(pose.time)"
          />
          <div class="preview-footer">
            <span>Example frame</span><span>{{ presetName }}</span>
          </div>
        </div>
        <div class="capture-panel">
          <CaptureModeGroup v-model="captureMode" labels stacked full />
          <div class="source-label">
            <Monitor :size="14" /><span>Entire screen</span>
          </div>
          <div class="preset-label">Editor preset</div>
          <CapturePresetSelect
            kind="video"
            compact
            @toggle="(value) => (open = value)"
          />
          <div class="export-setting">
            <ArrowDownToLine :size="13" /><span
              >MP4 <span>·</span> 1080p <span>·</span> 60 fps</span
            >
          </div>
          <Button block variant="primary" size="lg" :icon="Sparkles"
            >Record with {{ presetName }}</Button
          >
        </div>
      </template>
      <template v-else>
        <div class="export-preview">
          <Preview
            ref="preview"
            preset="nocturne"
            :time="exported.renderTime"
          />
        </div>
        <div v-if="!exported.stopped" class="recorder-container">
          <RecorderBar
            phase="recording"
            recording-time="00:06"
            visibility="always"
          />
        </div>
        <div v-show="exported.stopped" class="status-container">
          <QuickSnipStatus />
        </div>
      </template>
    </section>
    <div class="caption">
      <template v-if="mode === 'presets'"
        ><span>Your preset.</span> Ready before you record.</template
      ><template v-else
        ><Check v-if="exported.completed" :size="14" /><span>{{
          exported.completed
            ? "Finished. On your machine."
            : "Stop recording. Beam takes it from here."
        }}</span></template
      >
    </div>
    <DemoCursor :mode="mode" :time="pose.time" />
  </div>
</template>
