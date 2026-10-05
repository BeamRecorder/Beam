<script setup lang="ts">
import { computed } from "vue";
import { FileJson, ShieldCheck, Check } from "@lucide/vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import ButtonGroup from "../../../apps/desktop/src/components/ui/button/ButtonGroup.vue";
import Select from "../../../apps/desktop/src/components/ui/select/Select.vue";
import BigSlider from "../../../apps/desktop/src/components/ui/slider/BigSlider.vue";
import Switch from "../../../apps/desktop/src/components/ui/switch/Switch.vue";
import ProgressBar from "../../../apps/desktop/src/components/ui/progressbar/ProgressBar.vue";
import { captionState } from "./motion";
import type { Pose } from "./demo-types";
const props = defineProps<{ pose: Pose }>();
const state = computed(() => captionState(props.pose.time));
</script>

<template>
  <aside class="inspector caption-inspector">
    <h2>Captions</h2>
    <ButtonGroup
      full
      size="sm"
      variant="neutral"
      :columns="2"
      :selection="{ count: 2, index: state.styling ? 1 : 0 }"
    >
      <Button size="sm" :variant="!state.styling ? 'selected' : 'ghost'"
        >Generate</Button
      >
      <Button
        size="sm"
        :variant="state.styling ? 'selected' : 'ghost'"
        data-target="style"
        >Style</Button
      >
    </ButtonGroup>
    <div v-if="!state.styling" class="panel-controls">
      <label class="field"
        ><span>Audio source</span
        ><Select
          model-value="microphone"
          :options="[{ value: 'microphone', label: 'Microphone' }]"
          size="sm"
      /></label>
      <div class="fields-row">
        <label class="field"
          ><span>Language</span
          ><Select
            model-value="en"
            :options="[{ value: 'en', label: 'English' }]"
            size="sm"
        /></label>
        <label class="field"
          ><span>Model</span
          ><Select
            model-value="base"
            :options="[{ value: 'base', label: 'Whisper Base' }]"
            size="sm"
        /></label>
      </div>
      <p class="local-note">
        <ShieldCheck :size="13" />Runs locally on your device.
      </p>
      <div class="generation-progress">
        <ProgressBar :value="state.progress" /><span>{{
          state.generated
            ? "Captions ready"
            : state.progress > 0
              ? "Generating captions…"
              : "Ready to transcribe"
        }}</span>
      </div>
      <Button size="sm" variant="secondary" block data-target="generate">{{
        state.generated ? "Regenerate captions" : "Generate captions"
      }}</Button>
    </div>
    <div v-else class="panel-controls styling-controls">
      <label class="field"
        ><span>Font</span
        ><Select
          model-value="Hanken Grotesk"
          :options="[{ value: 'Hanken Grotesk', label: 'Hanken Grotesk' }]"
          size="sm"
      /></label>
      <div data-target="font-size">
        <BigSlider
          label="Font size"
          :model-value="state.fontSize"
          :min="12"
          :max="256"
          :default-value="104"
          :format-value="(value) => `${Math.round(value)}px`"
        />
      </div>
      <div class="toggle-field" data-target="highlight">
        <span>Word highlights</span
        ><Switch :model-value="state.highlight" aria-label="Word highlights" />
      </div>
      <div class="toggle-field" data-target="background">
        <span>Caption background</span
        ><Switch
          :model-value="state.background"
          aria-label="Caption background"
        />
      </div>
    </div>
    <div class="transcript-action" data-target="transcript">
      <Button
        :icon="state.transcript ? Check : FileJson"
        size="sm"
        variant="secondary"
        block
        :disabled="!state.generated"
        >{{
          state.transcript ? "Transcript.json" : "Export transcript"
        }}</Button
      >
    </div>
  </aside>
</template>
