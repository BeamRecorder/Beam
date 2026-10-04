<script setup lang="ts">
import { computed } from 'vue';
import RecorderBar from '../../../apps/desktop/src/components/hud/recorder/RecorderBar.vue';
import RecorderSetup from './RecorderSetup.vue';
import { clickScale, stateAt } from './motion';
import type { RecorderPose } from './demo-types';
import pointer from '../assets/figma-pointer.svg';
import wallpaper from '../../../public/wallpapers/image/sonoma-horizon.webp';

const props = defineProps<{ pose: RecorderPose }>();
const state = computed(() => stateAt(props.pose.time));
const camera = computed(() => ({ transform: `scale(${1 + props.pose.camera * 0.035})` }));
const setupStyle = computed(() => ({
  opacity: props.pose.setupOpacity,
  transform: `scale(${1.5 * props.pose.setupScale})`,
}));
const barStyle = computed(() => ({
  opacity: props.pose.barOpacity,
  transform: `translateY(${props.pose.barY}px) scale(1.6)`,
}));
const pointerStyle = computed(() => ({
  transform: `translate3d(${props.pose.x - 6.4}px,${props.pose.y - 6.4}px,0) scale(${clickScale(props.pose.time)})`,
}));
</script>

<template>
  <div class="design-stage">
    <img class="wallpaper" :src="wallpaper" alt="" />
    <div class="world" :style="camera">
      <div class="setup-host" :style="setupStyle">
        <RecorderSetup :mode="state.mode" :target="state.target" />
      </div>
      <div class="bar-host" :style="barStyle">
        <RecorderBar :phase="state.phase" :recording-time="state.recordingTime" visibility="always" preview />
      </div>
      <div class="demo-cursor" :style="pointerStyle" aria-hidden="true"><img :src="pointer" alt="" /></div>
    </div>
  </div>
</template>
