<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Clapperboard, Download, Play, SkipBack, Focus, Undo2, Redo2 } from '@lucide/vue';
import Button from '../../../apps/desktop/src/components/ui/button/Button.vue';
import ZoomPanel from '../../../apps/desktop/src/components/editor/properties/zoom/ZoomPanel.vue';
import Preview from './Preview.vue';
import ZoomTimeline from './ZoomTimeline.vue';
import { selectedLens, sourceTime } from './scene-model';
import { clickScale, stateAt } from './motion';
import type { DemoKind, DemoTheme, Pose, SceneHandle } from './demo-types';
import wallpaperDark from '../assets/tahoe-dark.webp';
import wallpaperLight from '../assets/tahoe-light.webp';
import pointer from '../assets/figma-pointer.svg';
const props = defineProps<{ kind: DemoKind; theme: DemoTheme; pose: Pose }>();
const preview = ref<SceneHandle | null>(null), track = ref<SceneHandle | null>(null);
const zoom = computed(() => selectedLens(props.kind, props.pose.time));
const time = computed(() => props.kind === 'glass' ? 1000 : sourceTime(props.pose.time));
const ready = (async () => { await nextTick(); await Promise.all([preview.value!.ready, track.value!.ready]); })();
function paint() { preview.value!.paint(); track.value!.paint(); }
defineExpose({ ready, paint });
</script>
<template>
  <div class="design-stage">
    <img :src="theme === 'dark' ? wallpaperDark : wallpaperLight" class="wallpaper" alt="" />
    <div class="world" :style="{ opacity: stateAt(pose.time, kind).opacity, transform: `scale(${1 + pose.camera * .025})` }">
      <div class="editor-card">
        <header class="project-bar"><Clapperboard :size="15" />
          <span>{{ kind === 'glass' ? 'Beautiful Captures' : 'Quiet Aurora 4' }}</span>
          <span class="project-format">{{ kind === 'glass' ? '1280 × 720' : '1280 × 680' }}</span>
          <Button :icon="Download" size="xs" variant="primary">Export</Button>
        </header>
        <div class="workspace">
          <section class="preview-area" aria-label="Composition preview">
            <Preview ref="preview" :kind="kind" :pose="pose" />
            <div class="preview-toolbar"><Button :icon="Undo2" size="xs" variant="ghost" icon-only aria-label="Undo" />
              <Button :icon="Redo2" size="xs" variant="ghost" icon-only aria-label="Redo" />
              <span>Fit</span></div>
          </section>
          <aside class="inspector"><h2><Focus :size="15" />Zoom</h2>
            <div class="inspector-scroll">
              <ZoomPanel :selected-zoom="zoom" :can-generate="kind === 'automatic'"
                :has-automatic-zooms="kind === 'automatic' && pose.time >= 3.35 && pose.time < 9.5"
                :motion-blur="{ enabled: false, intensity: 0 }"
                :canvas-size="{ width: 1280, height: kind === 'glass' ? 720 : 680 }" />
            </div>
          </aside>
        </div>
        <div class="playback-bar"><span><Clapperboard :size="13" />Studio</span>
          <div><Button :icon="SkipBack" size="xs" variant="ghost" icon-only aria-label="Go to start" />
            <Button :icon="Play" size="xs" variant="ghost" icon-only aria-label="Play" />
            <span class="clock">00:{{ Math.floor(time / 1000).toString().padStart(2, '0') }} <span>/ 00:{{ kind === 'glass' ? '10' : '08' }}</span></span>
          </div><span>100%</span></div>
        <ZoomTimeline ref="track" :kind="kind" :pose="pose" />
      </div>
      <div v-if="!stateAt(pose.time, kind).dialog" class="demo-cursor" :style="{ transform: `translate3d(${pose.x - 5.33}px,${pose.y - 5.33}px,0) scale(${clickScale(pose.time, kind)})` }">
        <img :src="pointer" alt="" /></div>
    </div>
  </div>
  <Teleport to="body"><div v-if="stateAt(pose.time, kind).dialog" class="demo-cursor dialog-pointer"
    :style="{ transform: `translate3d(${(pose.x * 1.025 - 14.848) * 1.25 - 6.66}px,${(pose.y * 1.025 - 7.36) * 1.25 - 6.66}px,0) scale(${clickScale(pose.time, kind)})` }">
    <img :src="pointer" alt="" /></div></Teleport>
</template>
