<script setup lang="ts">
import { computed } from "vue";
import { Mic } from "@lucide/vue";
import AudioPanel from "../../../apps/desktop/src/components/editor/properties/audio/AudioPanel.vue";
import AudioClipPropertiesPanel from "../../../apps/desktop/src/components/editor/properties/clip/AudioClipPropertiesPanel.vue";
import { audioState } from "./motion";
import waveform from "../assets/waveform.json";
import type { Pose } from "./demo-types";
const props = defineProps<{ pose: Pose }>();
const state = computed(() => audioState(props.pose.time));
const clip = computed(() => ({
  name: "Voiceover",
  volume: state.value.volume,
  normalization: {
    enabled: state.value.normalized,
    mode: "peak" as const,
    targetLufs: -16,
    targetPeakDbtp: -1,
    appliedGainDb: waveform.gainDb,
    analysisVersion: 1,
    analysisKey: waveform.sha256,
  },
}));
</script>

<template>
  <aside class="inspector audio-inspector">
    <h2>{{ state.selected ? "Voiceover" : "Audio" }}</h2>
    <template v-if="state.selected">
      <p class="selected-source">
        <Mic :size="13" />Voiceover · {{ waveform.duration.toFixed(1) }} s
      </p>
      <div class="clip-panel" data-target="audio-properties">
        <AudioClipPropertiesPanel
          :clip="clip"
          :normalization-status="
            state.normalizing
              ? 'analyzing'
              : state.normalized
                ? 'ready'
                : undefined
          "
        />
      </div>
    </template>
    <AudioPanel
      v-else
      :volume="100"
      :is-system-audio-enabled="true"
      :is-mic-audio-enabled="false"
      :has-system-audio="true"
      :has-mic-audio="false"
      :has-audio="true"
      :system-volume="80"
    />
    <div v-if="state.selected" class="audio-source-list">
      <span>Project audio</span>
      <div><span>System audio</span><strong>80%</strong></div>
      <div><span>Microphone</span><strong>100%</strong></div>
      <div>
        <span>Voiceover</span><strong>{{ Math.round(state.volume) }}%</strong>
      </div>
    </div>
  </aside>
</template>
