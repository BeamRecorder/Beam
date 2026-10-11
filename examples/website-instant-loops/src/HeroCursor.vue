<script setup lang="ts">
import { computed } from 'vue';
import arrow from '../assets/macos-arrow.svg';
import { heroPointer } from './hero-motion';
const props = defineProps<{ time: number }>();
const pointer = computed(() => heroPointer(props.time));
</script>
<template>
  <Teleport to="body">
    <img class="hero-cursor" :src="arrow" alt="" aria-hidden="true" :style="{
      transform: `translate3d(${pointer.x - 3}px,${pointer.y - 3}px,0) scale(${pointer.scale})`,
    }" />
  </Teleport>
</template>
<style scoped>
.hero-cursor { position: absolute; left: 0; top: 0; width: 19px; height: 27px; transform-origin: 3px 3px;
  pointer-events: none; z-index: 2147483647; filter: drop-shadow(0 1px 2px #0008); }
</style>
