<script setup lang="ts">
import { computed } from "vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import ButtonGroup from "../../../apps/desktop/src/components/ui/button/ButtonGroup.vue";
import TransitionSettingsPanel from "../../../apps/desktop/src/components/editor/properties/clip/TransitionSettingsPanel.vue";
import { transitionState } from "./motion";
import type { Pose } from "./demo-types";
const props = defineProps<{ pose: Pose }>();
const state = computed(() => transitionState(props.pose.time));
</script>
<template>
  <aside class="inspector transition-inspector">
    <h2>Transitions</h2>
    <ButtonGroup
      full
      size="xs"
      :columns="2"
      variant="neutral"
      :selection="{ index: state.canvas ? 1 : 0, count: 2 }"
    >
      <Button size="xs" :variant="state.canvas ? 'ghost' : 'selected'"
        >Clip</Button
      >
      <Button
        data-target="canvas"
        size="xs"
        :variant="state.canvas ? 'selected' : 'ghost'"
        >Canvas</Button
      >
    </ButtonGroup>
    <TransitionSettingsPanel
      :transitions="{
        entry: {
          preset: state.preset,
          durationMs: state.duration,
          easingPower: 3,
        },
        exit: null,
      }"
      :timeline-duration-ms="8000"
    />
  </aside>
</template>
