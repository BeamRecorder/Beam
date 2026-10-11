<script setup lang="ts">
import { FileCode2, Film, Image } from '@lucide/vue';
import { computed } from 'vue';
import Artwork from './Artwork.vue';
import darkStill from '../assets/still-dark.png';
import lightStill from '../assets/still-light.png';
import { frameNumber, timecode, stillTimeMs } from './scene-state';
import type { ScenePose } from './scene-types';
const props = defineProps<{ pose: ScenePose }>();
const theme = document.documentElement.dataset.demoTheme;
const still = theme === 'dark' ? darkStill : lightStill;
const displayTime = computed(() => (props.pose.clock >= 7 ? 0 : props.pose.clock * 1000));
</script>
<template>
  <main class="scene">
    <header class="heading">
      <div>
        <h1>One source. Two outputs.</h1>
        <p>From HTML to a video or an image.</p>
      </div>
      <div class="source"><FileCode2 :size="28" :stroke-width="1.6" /><span>scene.html</span></div>
    </header>
    <div class="outputs">
      <section class="output motion-output" aria-label="Animated HTML in Studio">
        <div class="output-heading"><Film :size="27" :stroke-width="1.6" /><span>Studio</span></div>
        <div class="preview"><Artwork /></div>
        <div class="output-meta">
          <span>MP4 / WebM</span><span class="clock">{{ timecode(displayTime) }}</span>
        </div>
      </section>
      <section class="output still-output" aria-label="PNG frame from the same HTML">
        <div class="output-heading"><Image :size="27" :stroke-width="1.6" /><span>Screenshot</span></div>
        <div class="preview">
          <img class="still-image" :src="still" alt="The same Make it move composition frozen at 2.4 seconds" />
        </div>
        <div class="output-meta">
          <span>PNG / WebP</span><span class="clock">Frame {{ frameNumber(stillTimeMs) }}</span>
        </div>
      </section>
    </div>
    <p class="caption">The same HTML. The same renderer.</p>
  </main>
</template>
<style scoped>
.scene {
  width: 1280px;
  height: 800px;
  padding: 68px 64px 0;
  background: var(--color-bg-app);
}
.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 103px;
  margin-bottom: 53px;
}
h1 {
  margin: 0 0 14px;
  font-size: 48px;
  font-weight: 550;
  letter-spacing: -1.5px;
  line-height: 1.05;
}
.heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 26px;
}
.source {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  background: var(--color-bg-surface);
  font-family: 'Noto Sans Mono', monospace;
  font-size: 24px;
}
.source svg {
  color: var(--color-primary);
}
.outputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.output {
  border: 1px solid var(--color-border-strong);
  border-radius: 14px;
  background: var(--color-bg-element);
  overflow: hidden;
}
.output-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
  font-size: 28px;
  font-weight: 500;
}
.output-heading svg {
  color: var(--text-secondary);
}
.preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
}
.still-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.output-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 62px;
  padding: 0 24px;
  border-top: 1px solid var(--color-border);
  font-size: 23px;
  color: var(--text-secondary);
}
.clock {
  font-family: 'Noto Sans Mono', monospace;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.caption {
  margin: 32px 0 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 26px;
}
</style>
