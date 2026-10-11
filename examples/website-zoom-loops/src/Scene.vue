<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Clapperboard, Download, Play, SkipBack, Magnet, Undo2, Redo2 } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import ZoomInspector from './ZoomInspector.vue';
import ZoomTimeline from './ZoomTimeline.vue';
import DemoCursor from './DemoCursor.vue';
import { contentOpacity, phaseTime } from './motion';
import { paintPreview } from './preview';
import type { DemoMode, DemoScene, Pose } from './demo-types';
import lightWallpaper from '../assets/tahoe-light.webp';
import darkWallpaper from '../assets/tahoe-dark.webp';
import artworkUrl from '../assets/beautiful-captures.webp';
const props = defineProps<{ mode: DemoMode; pose: Pose }>();
const preview = ref<HTMLCanvasElement | null>(null),
  timeline = ref<DemoScene | null>(null);
const wallpaper = document.documentElement.dataset.demoTheme === 'dark' ? darkWallpaper : lightWallpaper;
const clock = computed(() => Math.floor(phaseTime(props.pose.time)).toString().padStart(2, '0'));
const image = new Image();
image.src = artworkUrl;
function paint() {
  if (!preview.value || !image.complete) return;
  paintPreview(preview.value, image, props.mode, props.pose.time);
  timeline.value?.paint();
}
const ready = (async () => {
  await nextTick();
  await Promise.all([image.decode(), timeline.value!.ready]);
  paint();
})();
defineExpose({ ready, paint });
</script>
<template>
  <div class="design-stage">
    <img :src="wallpaper" class="desktop-wallpaper" alt="" />
    <div class="world" :style="{ opacity: contentOpacity(pose.time) }">
      <div class="editor-card">
        <header class="project-bar">
          <Clapperboard :size="13" /><span>Beautiful Captures</span>
          <span class="project-format">1280 × 720</span>
          <Button :icon="Download" size="xs" variant="primary">Export</Button>
        </header>
        <main class="workspace">
          <section class="preview-area" aria-label="Composition preview">
            <canvas ref="preview" class="composition-preview" width="996" height="561" />
            <div class="preview-toolbar">
              <Button :icon="Magnet" size="xs" variant="ghost" icon-only aria-label="Snap" />
              <Button :icon="Undo2" size="xs" variant="ghost" icon-only aria-label="Undo" />
              <Button :icon="Redo2" size="xs" variant="ghost" icon-only aria-label="Redo" />
            </div>
          </section>
          <ZoomInspector :mode="mode" :pose="pose" />
        </main>
        <div class="playback-bar">
          <span class="track-mode"><Clapperboard :size="12" />Studio</span>
          <div class="playback-actions">
            <Button :icon="SkipBack" size="xs" variant="ghost" icon-only aria-label="Go to start" />
            <Button :icon="Play" size="xs" variant="ghost" icon-only aria-label="Play" />
            <span class="time-display">00:{{ clock }} <span>/ 00:08</span></span>
          </div>
          <span class="project-format">100%</span>
        </div>
        <ZoomTimeline ref="timeline" :mode="mode" :pose="pose" />
      </div>
      <DemoCursor :mode="mode" :time="pose.time" />
    </div>
  </div>
</template>
