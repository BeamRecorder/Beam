<script setup lang="ts">
import { computed } from 'vue';
import TeleprompterScene from './TeleprompterScene.vue';
import ProjectsScene from './ProjectsScene.vue';
import { clickScale, stateAt } from './motion';
import type { DemoKind, DemoPose } from './demo-types';
import pointer from '../assets/figma-pointer.svg';
import wallpaper from '../../../public/wallpapers/image/sonoma-horizon.webp';
const props = defineProps<{ pose: DemoPose; kind: DemoKind; theme: string }>();
const state = computed(() => stateAt(props.pose.time));
</script>
<template>
  <div class="design-stage">
    <img class="wallpaper" :src="wallpaper" alt="" />
    <div class="world" :style="{ transform: `scale(${1 + pose.camera * 0.018})`, opacity: state.opacity }">
      <TeleprompterScene v-if="kind === 'teleprompter'" :pose="pose" :theme="theme" /><ProjectsScene
        v-else
        :pose="pose"
      />
    </div>
    <div
      class="demo-cursor"
      :style="{
        opacity: state.opacity,
        transform: `translate3d(${pose.x - 6.4}px,${pose.y - 6.4}px,0) scale(${clickScale(pose.time, kind)})`,
      }"
      aria-hidden="true"
    >
      <img :src="pointer" alt="" />
    </div>
  </div>
</template>
