<script setup lang="ts">
import type { SceneState } from './scene-types';
import beam from '../assets/beam.webp';
defineProps<{ state: SceneState }>();
</script>

<template>
  <div class="artwork">
    <div class="artwork-top"><span>AN OPEN CANVAS</span><span>01 — HTML</span></div>
    <div class="orbit" data-layout-allow-overflow="true" :style="{ background: state.accent }">
      <span class="orbit-cut"></span><span class="orbit-dot"></span>
    </div>
    <h1>{{ state.title }}</h1>
    <div class="artwork-footer"><img :src="beam" alt="Beam" /><span>Built with code. Made with Beam.</span></div>
  </div>
</template>

<style scoped>
.artwork {
  position: relative;
  width: 500px;
  height: 312.5px;
  overflow: hidden;
  color: #26201c;
  background: #f3ede4;
  transform: translateZ(0);
}
.artwork-top {
  position: absolute;
  inset: 24px 28px auto;
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.2px;
}
h1 {
  position: absolute;
  left: 28px;
  top: 74px;
  width: 280px;
  margin: 0;
  font-size: 59px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -3.2px;
}
.orbit {
  position: absolute;
  width: 178px;
  height: 178px;
  top: 67px;
  right: -32px;
  border-radius: 50%;
  overflow: hidden;
}
.orbit-cut {
  position: absolute;
  inset: 0 50% 0 0;
  background: #26201c;
}
.orbit-dot {
  position: absolute;
  left: 23px;
  top: 65px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f3ede4;
}
.artwork-footer {
  position: absolute;
  inset: auto 28px 22px;
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 10px;
  font-weight: 500;
}
.artwork-footer img {
  width: 19px;
  height: 19px;
}
</style>
