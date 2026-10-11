<script setup lang="ts">
import { computed } from "vue";
import { Image, Scan } from "@lucide/vue";
import ClipPropertiesPanel from "../../../apps/desktop/src/components/editor/properties/clip/ClipPropertiesPanel.vue";
import CaptionClipPanel from "../../../apps/desktop/src/components/editor/properties/captions/CaptionClipPanel.vue";
import CanvasBackgroundTabs from "../../../apps/desktop/src/components/editor/properties/canvas/CanvasBackgroundTabs.vue";
import PropertiesPanelHeader from "../../../apps/desktop/src/components/editor/properties/PropertiesPanelHeader.vue";
import Accordion from "../../../apps/desktop/src/components/ui/accordion/Accordion.vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import { gradientCssBackground } from "../../../apps/desktop/src/components/editor/composables/backgroundCatalog";
import {
  CANVAS,
  captionAt,
  GRADIENTS,
  OCEAN,
  selectedScreen,
} from "./scene-model";
import { BEATS, modeAt, phaseTime } from "./motion";
import type { Pose } from "./demo-types";
import ventura from "../assets/ventura.webp";
const props = defineProps<{ pose: Pose }>();
const mode = computed(() => modeAt(props.pose.time)),
  clip = computed(() => selectedScreen(props.pose.time));
const caption = computed(() => captionAt(props.pose.time));
const kind = computed(() =>
  phaseTime(props.pose.time) < BEATS.gradient
    ? ("image" as const)
    : ("gradient" as const),
);
const title = computed(() =>
  mode.value === "caption"
    ? "Caption"
    : mode.value === "canvas"
      ? "Canvas"
      : "Quiet Aurora 4",
);
</script>
<template>
  <aside class="inspector screenshot-chrome" :data-mode="mode">
    <PropertiesPanelHeader :title="title" />
    <div class="inspector-scroll" data-layout-allow-occlusion="true">
      <CaptionClipPanel v-if="mode === 'caption'" :clip="caption" />
      <div v-else-if="mode === 'canvas'" class="canvas-options">
        <Accordion
          :model-value="true"
          appearance="inspector"
          title="Background"
        >
          <CanvasBackgroundTabs :model-value="kind" />
          <div v-if="kind === 'image'" class="background-grid">
            <Button
              block
              variant="selected"
              size="xs"
              content-layout="custom"
              :style="{ height: '82px', padding: '4px' }"
              aria-label="Ventura"
            >
              <span class="tile-content"
                ><img :src="ventura" alt="" /><span>Ventura</span></span
              >
            </Button>
          </div>
          <div v-else class="background-grid">
            <Button
              v-for="gradient in GRADIENTS"
              :key="gradient.id"
              block
              size="xs"
              content-layout="custom"
              :style="{ height: '82px', padding: '4px' }"
              :variant="
                phaseTime(pose.time) >= BEATS.ocean && gradient.id === OCEAN.id
                  ? 'selected'
                  : 'secondary'
              "
              :aria-label="gradient.name"
            >
              <span class="tile-content"
                ><span
                  class="gradient-art"
                  :style="{
                    background: gradientCssBackground(gradient.gradient),
                  }"
                />
                <span>{{ gradient.name }}</span></span
              >
            </Button>
          </div>
        </Accordion>
      </div>
      <ClipPropertiesPanel v-else :canvas-size="CANVAS" :selected-clip="clip" />
    </div>
  </aside>
</template>
<style scoped>
.canvas-options {
  padding-top: 2px;
}
.background-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.tile-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 10px;
}
.tile-content img,
.gradient-art {
  display: block;
  width: 100%;
  height: 50px;
  object-fit: cover;
  border-radius: var(--radius-xs);
}
</style>
