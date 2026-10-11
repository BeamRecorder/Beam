<script setup lang="ts">
import { computed, ref } from 'vue';
import Accordion from '../../../apps/desktop/src/components/ui/accordion/Accordion.vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import ButtonGroup from '../../../apps/desktop/src/components/ui/button/ButtonGroup.vue';
import BigSlider from '../../../apps/desktop/src/components/ui/slider/BigSlider.vue';
import ZoomTiltControls from '../../../apps/desktop/src/components/editor/properties/zoom/ZoomTiltControls.vue';
import ZoomFocusControls from '../../../apps/desktop/src/components/editor/properties/zoom/ZoomFocusControls.vue';
import { ZOOM_DEPTH_SCALES, type ZoomDepth } from '../../../packages/engine/src/zoom/zoom-types';
import { selectedZoom } from './scene-model';
import type { DemoMode, Pose } from './demo-types';
const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const zoom = computed(() => selectedZoom(props.mode, props.pose.time));
const open = ref({ style: true, placement: true, magnification: true, camera: false, animation: false });
const formatDepth = (value: number) => `${ZOOM_DEPTH_SCALES[Math.round(value) as ZoomDepth]}×`;
</script>
<template>
  <aside class="inspector">
    <h2>Zoom</h2>
    <div class="inspector-body">
      <Accordion v-model="open.style" title="Style" appearance="inspector">
        <ButtonGroup full size="xs" variant="neutral" :selection="{ count: 3, index: mode === '3d' ? 1 : 0 }">
          <Button
            v-for="value in ['2d', '3d', 'glass']"
            :key="value"
            size="xs"
            :variant="mode === value ? 'selected' : 'ghost'"
            >{{ value === 'glass' ? 'Loupe' : value.toUpperCase() }}</Button
          >
        </ButtonGroup>
      </Accordion>
      <Accordion v-model="open.placement" title="Placement" appearance="inspector">
        <div class="zoom-settings">
          <ButtonGroup full size="xs" variant="neutral" :selection="{ count: 2, index: 1 }">
            <Button size="xs" variant="ghost">Auto cursor</Button>
            <Button size="xs" variant="selected">Manual focus</Button>
          </ButtonGroup>
          <ZoomTiltControls v-if="mode === '3d'" :zoom="zoom" />
          <ZoomFocusControls v-else :zoom="zoom" />
        </div>
      </Accordion>
      <Accordion v-model="open.magnification" title="Magnification" appearance="inspector">
        <div class="zoom-settings">
          <BigSlider
            :model-value="zoom.depth"
            :min="1"
            :max="6"
            :step="1"
            :default-value="2"
            label="Zoom level"
            :format-value="formatDepth"
          />
          <div v-if="mode === '2d'" class="depth-options">
            <Button
              v-for="(value, index) in Object.values(ZOOM_DEPTH_SCALES)"
              :key="value"
              size="xs"
              :variant="zoom.depth === index + 1 ? 'secondary' : 'ghost'"
              >{{ value }}×</Button
            >
          </div>
        </div>
      </Accordion>
    </div>
  </aside>
</template>
<style scoped>
.zoom-settings {
  display: grid;
  gap: 10px;
}
.depth-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}
</style>
