<script setup lang="ts">
import { computed } from 'vue';
import RecorderBar from '../../../apps/desktop/src/components/hud/recorder/RecorderBar.vue';
import { clickScale, stateAt } from './motion';
import type { BreathPose } from './breath-types';
import pointer from '../assets/figma-pointer.svg';
import { frameIndex } from './media';
import opening from '../assets/taking-breath.webp';
import wallpaper from '../../../public/wallpapers/image/sonoma-horizon.webp';

const props = defineProps<{ pose: BreathPose; frames: string[] }>();
const frame = computed(() => props.frames[frameIndex(props.pose.time)]);
const state = computed(() => stateAt(props.pose.time));
const camera = computed(() => ({ transform: `scale(${1 + props.pose.camera * 0.018})` }));
const pointerStyle = computed(() => ({
  transform: `translate3d(${props.pose.x - 6.4}px,${props.pose.y - 6.4}px,0) scale(${clickScale(props.pose.time)})`,
}));
</script>

<template>
  <div class="design-stage">
    <img class="wallpaper" :src="wallpaper" alt="" />
    <div class="world" :style="camera">
      <div class="facecam">
        <img class="footage-frame" :src="frame" alt="" />
        <img class="opening-frame" :src="opening" :style="{ opacity: state.resetOpacity }" alt="" />
      </div>
      <div class="bar-host">
        <RecorderBar :phase="state.phase" :recording-time="state.recordingTime" visibility="always" preview />
      </div>
      <div class="demo-cursor" :style="pointerStyle" aria-hidden="true"><img :src="pointer" alt="" /></div>
    </div>
  </div>
</template>
