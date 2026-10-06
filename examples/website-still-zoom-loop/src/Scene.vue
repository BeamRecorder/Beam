<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ArrowLeft, ChevronDown, Copy, Download, Focus, Layers, Maximize, Search, Settings2 } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import EditorTitlebar from '../../../apps/desktop/src/components/editor/EditorTitlebar.vue';
import ScreenshotToolbar from '../../../apps/desktop/src/components/screenshot/ScreenshotToolbar.vue';
import PropertiesPanelHeader from '../../../apps/desktop/src/components/editor/properties/PropertiesPanelHeader.vue';
import ZoomPanel from '../../../apps/desktop/src/components/editor/properties/zoom/ZoomPanel.vue';
import Preview from './Preview.vue';
import { contentOpacity, pointerAt, styleAt } from './motion';
import { CANVAS, selectedZoom } from './scene-model';
import type { DemoTheme, Pose, SceneHandle } from './demo-types';
import wallpaperLight from '../assets/tahoe-light.webp';
import wallpaperDark from '../assets/tahoe-dark.webp';
import pointer from '../assets/figma-pointer.svg';
import beamIcon from '../assets/beam.webp';
const props = defineProps<{ theme: DemoTheme; pose: Pose }>();
const preview = ref<SceneHandle | null>(null);
const zoom = computed(() => selectedZoom(props.pose.time));
const cursor = computed(() => pointerAt(props.pose.time));
const ready = (async () => { await nextTick(); await preview.value!.ready; })();
function paint() { preview.value!.paint(); }
defineExpose({ ready, paint });
</script>
<template>
  <div class="design-stage">
    <img :src="theme === 'dark' ? wallpaperDark : wallpaperLight" class="wallpaper" alt="" />
    <div class="world" :style="{ opacity: contentOpacity(pose.time) }">
      <div class="editor-card">
        <EditorTitlebar>
          <template #left>
            <Button :icon="ArrowLeft" size="xs" variant="ghost" icon-only aria-label="Back" />
            <span class="beam-brand"><img :src="beamIcon" alt="" />Beam</span>
            <Button size="xs" variant="secondary">Default <ChevronDown :size="12" /></Button>
            <Button :icon="Search" size="xs" variant="ghost" icon-only aria-label="Search" />
            <Button :icon="Settings2" size="xs" variant="ghost" icon-only aria-label="Settings" />
          </template>
          <template #center><span class="project-name">Beautiful Captures <ChevronDown :size="12" /></span></template>
          <template #right>
            <span class="dimensions">1280 × 720</span>
            <Button :icon="Maximize" size="xs" variant="ghost" icon-only aria-label="Fullscreen" />
            <Button :icon="Copy" size="xs" variant="secondary">Copy</Button>
            <Button :icon="Download" size="xs" variant="primary">Export</Button>
          </template>
        </EditorTitlebar>
        <main class="workspace">
          <aside class="inspector screenshot-chrome">
            <PropertiesPanelHeader title="Detail"><template #actions><Focus :size="14" /></template></PropertiesPanelHeader>
            <div class="inspector-scroll">
              <ZoomPanel still :selected-zoom="zoom" :canvas-size="CANVAS" :can-generate="false"
                :has-automatic-zooms="false" :motion-blur="{ enabled: false, intensity: 0 }" />
            </div>
          </aside>
          <div class="preview-area"><Preview ref="preview" :pose="pose" /></div>
          <div class="composition-toggle screenshot-chrome"><Layers :size="14" /><span>Composition</span><ChevronDown :size="13" /></div>
          <div class="dock">
            <ScreenshotToolbar :disabled="false" :cropping="false" :can-crop="true" :drawing="false"
              :editing-text="false" panel="zoom" :inspector-open="true" :can-undo="true" :can-redo="false" />
          </div>
          <span class="preview-scale">100%</span>
        </main>
      </div>
      <div class="demo-cursor" :data-style="styleAt(pose.time)"
        :style="{ transform: `translate3d(${cursor.x - 5.33}px,${cursor.y - 5.33}px,0) scale(${cursor.scale})` }">
        <img :src="pointer" alt="" />
      </div>
    </div>
  </div>
</template>
