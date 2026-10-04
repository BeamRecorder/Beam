<script setup lang="ts">
import { computed } from "vue";
import {
  Radio,
  CircleDot,
  MousePointer2,
  MousePointerClick,
} from "@lucide/vue";
import Select from "../../../apps/desktop/src/components/ui/select/Select.vue";
import BigSlider from "../../../apps/desktop/src/components/ui/slider/BigSlider.vue";
import Switch from "../../../apps/desktop/src/components/ui/switch/Switch.vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import ButtonGroup from "../../../apps/desktop/src/components/ui/button/ButtonGroup.vue";
import { MOTION, settingsAt } from "./motion";
import { PACK_OPTIONS } from "./catalog";
const props = defineProps<{ time: number }>();
const state = computed(() => settingsAt(props.time));
</script>
<template>
  <aside class="inspector">
    <h3><MousePointer2 :size="13" /> Cursor</h3>
    <div class="field">
      <label>Cursor pack</label
      ><Select
        size="sm"
        :model-value="state.packId"
        :options="PACK_OPTIONS"
        aria-label="Cursor pack"
      />
    </div>
    <BigSlider
      class="demo-slider"
      :model-value="state.size"
      :min="16"
      :max="96"
      label="Size"
      :format-value="(v) => `${Math.round(v)}px`"
    />
    <div class="motion-section">
      <BigSlider
        class="demo-slider"
        :model-value="MOTION.smoothing"
        :min="0"
        :max="1"
        label="Smoothing"
        :format-value="(v) => `${Math.round(v * 100)}%`"
      />
    </div>
    <div class="toggle">
      <span>Click spring</span
      ><Switch :model-value="true" aria-label="Click spring" />
    </div>
    <div class="field ripple">
      <label>Click effect</label
      ><ButtonGroup
        full
        :selection="{ index: state.rippleStyle === 'double' ? 1 : 0, count: 2 }"
        ><Button
          variant="tab"
          size="sm"
          block
          icon-only
          :class="{ active: state.rippleStyle === 'single' }"
          :icon="CircleDot"
          aria-label="Single ripple" /><Button
          variant="tab"
          size="sm"
          block
          icon-only
          :class="{ active: state.rippleStyle === 'double' }"
          :icon="Radio"
          aria-label="Double ripple"
      /></ButtonGroup>
    </div>
    <p><MousePointerClick :size="12" /> Smooth preset</p>
  </aside>
</template>
<style scoped>
.inspector {
  width: 196px;
  flex-shrink: 0;
  padding: 12px;
  background: var(--color-bg-surface);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.inspector > * {
  flex-shrink: 0;
}
.demo-slider {
  --text-secondary: var(--text-primary);
}
h3 {
  margin: 0 0 1px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
label,
.toggle {
  font-size: 11px;
  font-weight: 500;
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.motion-section {
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}
p {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: auto 0 0;
  font-size: 10px;
  color: var(--text-secondary);
}
</style>
