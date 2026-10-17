<script setup lang="ts">
import { computed } from 'vue';
import CanvasPanelLayout from '../../../apps/desktop/src/components/editor/properties/canvas/CanvasPanelLayout.vue';
import PropertiesPanelHeader from '../../../apps/desktop/src/components/editor/properties/PropertiesPanelHeader.vue';
import ClipPropertiesPanel from '../../../apps/desktop/src/components/editor/properties/clip/ClipPropertiesPanel.vue';
import ShapeLayerPropertiesPanel from '../../../apps/desktop/src/components/editor/properties/clip/ShapeLayerPropertiesPanel.vue';
import BlurPropertiesPanel from '../../../apps/desktop/src/components/editor/properties/clip/BlurPropertiesPanel.vue';
import type { FilmPose } from './film-types';
import { BASE, SCREEN, WALLPAPERS, blurClip, shapeClip } from './scene-model';
import { blurPercentAt, modeAt } from './motion';
const props = defineProps<{ pose: FilmPose }>();
const mode = computed(() => modeAt(props.pose.time));
const title = computed(
  () => ({ canvas: 'Canvas', clip: 'Screen recording', shape: 'Rectangle', blur: 'Privacy blur' })[mode.value],
);
const selectedScreen = computed(() => ({ ...SCREEN, ...SCREEN.appearance, clipTransform: SCREEN.transform }));
</script>
<template>
  <aside class="film-inspector properties-island">
    <div class="properties-scale-content">
      <PropertiesPanelHeader :title="title" :show-clip-actions="mode !== 'canvas'" :enabled="true" :toggleable="true" />
      <div class="film-inspector-scroll">
        <div class="panel-body">
          <CanvasPanelLayout
            v-if="mode === 'canvas'"
            :show-background="true"
            active-kind="image"
            :blur-percent="blurPercentAt(pose.time)"
            :watermark="BASE.canvas.watermark"
          >
            <div class="media-scroll-grid">
              <button
                v-for="wallpaper in WALLPAPERS"
                :key="wallpaper.id"
                type="button"
                class="media-tile"
                :class="{ active: (pose.time >= 4.8 ? 'ventura' : 'golden') === wallpaper.id }"
                :data-film-wallpaper="wallpaper.id"
                :aria-label="wallpaper.name"
              >
                <img :src="wallpaper.url" :alt="wallpaper.name" class="media-content loaded" />
              </button>
            </div>
          </CanvasPanelLayout>
          <ClipPropertiesPanel v-else-if="mode === 'clip'" :canvas-size="BASE.canvas" :selected-clip="selectedScreen" />
          <ShapeLayerPropertiesPanel
            v-else-if="mode === 'shape'"
            :canvas-size="BASE.canvas"
            :clip="shapeClip(pose.time)"
          />
          <BlurPropertiesPanel v-else :clip="{ ...blurClip(pose.time), cornerRadius: 8 }" />
        </div>
      </div>
    </div>
  </aside>
</template>
<style src="../../../apps/desktop/src/components/editor/properties/PropertiesPanel.css"></style>
<style src="../../../apps/desktop/src/components/editor/properties/canvas/canvas-panel.css"></style>
<style scoped>
.film-inspector {
  flex-shrink: 0;
}
.film-inspector-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
}
</style>
