<script setup lang="ts">
import { computed } from "vue";
import { SlidersHorizontal, Video, ChevronDown } from "@lucide/vue";
import CanvasBackgroundTabs from "../../../apps/desktop/src/components/editor/properties/canvas/CanvasBackgroundTabs.vue";
import AddTileButton from "../../../apps/desktop/src/components/ui/button/AddTileButton.vue";
import Button from "../../../apps/desktop/src/components/ui/button/Button.vue";
import Slider from "../../../apps/desktop/src/components/ui/slider/Slider.vue";
import {
  COLORS,
  GRADIENTS,
  IMAGES,
  VIDEO,
  gradientCssBackground,
} from "./catalog";
import { INITIAL_BACKGROUND, INITIAL_ID, clickAt, stateAt } from "./motion";
import type { CanvasPose } from "./demo-types";
const props = defineProps<{ pose: CanvasPose }>();
const state = computed(() => stateAt(props.pose.time));
const selected = computed(() =>
  state.value.restore >= 0.5 ? INITIAL_ID : state.value.current.id,
);
const tileStyle = (id: string) => ({
  transform: `scale(${clickAt(props.pose.time).click?.id === id ? 1 - (1 - clickAt(props.pose.time).scale) * 0.3 : 1})`,
});
</script>

<template>
  <aside class="library-panel">
    <h4><SlidersHorizontal :size="13" /> Background</h4>
    <div class="tabs"><CanvasBackgroundTabs :model-value="state.tab" /></div>
    <div class="catalog-window">
      <div v-show="state.tab === 'image'" class="media-scroll-grid">
        <AddTileButton label="Import custom image" />
        <button
          v-for="item in IMAGES"
          :key="item.id"
          :data-preset-id="item.id"
          class="media-tile"
          :class="{ active: selected === item.id }"
          :aria-label="item.name"
          :style="tileStyle(item.id)"
        >
          <img :src="item.url" :alt="item.name" class="media-content" />
        </button>
      </div>
      <div v-show="state.tab === 'video'" class="media-scroll-grid">
        <AddTileButton label="Import custom video" />
        <button
          :data-preset-id="VIDEO.id"
          class="media-tile"
          :class="{ active: selected === VIDEO.id }"
          :aria-label="VIDEO.name"
          :style="tileStyle(VIDEO.id)"
        >
          <img
            :src="VIDEO.poster"
            :alt="VIDEO.name"
            class="media-content"
          /><Video :size="13" class="video-mark" />
        </button>
      </div>
      <div v-show="state.tab === 'color'" class="swatches-grid">
        <AddTileButton label="Custom color" />
        <button
          v-for="item in COLORS"
          :key="item.id"
          :data-preset-id="item.id"
          class="swatch-tile"
          :class="{ active: selected === item.id }"
          :aria-label="item.name"
          :style="{ background: item.color, ...tileStyle(item.id) }"
        />
      </div>
      <div v-show="state.tab === 'gradient'" class="gradients-grid">
        <AddTileButton label="Custom gradient" />
        <button
          v-for="item in GRADIENTS"
          :key="item.id"
          :data-preset-id="item.id"
          class="swatch-tile"
          :class="{ active: selected === item.id }"
          :aria-label="item.name"
          :style="{
            background: gradientCssBackground(item.gradient),
            ...tileStyle(item.id),
          }"
        />
      </div>
    </div>
    <p class="selected-name">
      {{
        state.restore >= 0.5 ? INITIAL_BACKGROUND.title : state.current.title
      }}
    </p>
    <div class="frame-row">
      <span>Frame</span
      ><Button variant="secondary" size="xs" :icon="ChevronDown">Safari</Button>
    </div>
    <div class="appearance-row">
      <label>Padding</label
      ><Slider
        :model-value="24"
        size="compact"
        label="Padding"
        value-suffix="px"
      />
    </div>
    <div class="appearance-row">
      <label>Corners</label
      ><Slider
        :model-value="16"
        size="compact"
        label="Corner radius"
        value-suffix="px"
      />
    </div>
  </aside>
</template>

<style scoped>
.library-panel {
  width: 300px;
  flex-shrink: 0;
  padding: 12px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
h4 {
  margin: 0 0 10px;
  height: 18px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
}
.tabs {
  height: 30px;
  margin-bottom: 10px;
}
.catalog-window {
  height: 98px;
}
.selected-name {
  height: 14px;
  margin: 10px 0 12px;
  font-size: 11px;
  color: var(--text-secondary);
}
.frame-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-top: 1px solid var(--color-border);
  font-size: 11px;
}
.appearance-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.appearance-row label {
  width: 48px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
}
.video-mark {
  position: absolute;
  bottom: 4px;
  left: 4px;
  color: white;
  filter: drop-shadow(0 1px 2px #000);
}
</style>
