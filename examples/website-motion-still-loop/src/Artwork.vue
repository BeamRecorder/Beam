<script setup lang="ts">
import beam from '../assets/beam.webp';
</script>
<template>
  <article class="artwork">
    <p class="artwork-label">AN OPEN CANVAS</p>
    <h2>Make it move.</h2>
    <div class="orbit" data-layout-allow-overflow="true" aria-hidden="true">
      <div class="orbit-half"></div>
      <div class="orbit-dot"></div>
    </div>
    <div class="artwork-brand"><img :src="beam" alt="Beam" /><span>Made with Beam.</span></div>
  </article>
</template>
<style scoped>
.artwork {
  position: relative;
  width: 100%;
  height: 100%;
  container-type: size;
  overflow: hidden;
  background: var(--color-bg-surface);
  color: var(--text-primary);
}
.artwork-label {
  position: absolute;
  left: 8cqw;
  top: 9cqh;
  margin: 0;
  font-size: 2.2cqw;
  font-weight: 550;
  letter-spacing: 0.18cqw;
}
h2 {
  position: absolute;
  left: 8cqw;
  top: 25cqh;
  width: 57cqw;
  margin: 0;
  font-size: 15cqw;
  line-height: 0.98;
  letter-spacing: -0.75cqw;
  font-weight: 550;
}
.orbit {
  position: absolute;
  right: -3cqw;
  top: 24cqh;
  width: 36cqw;
  height: 36cqw;
  overflow: hidden;
  border-radius: 50%;
  background: var(--color-primary);
}
.orbit-half {
  position: absolute;
  inset: 0 50% 0 0;
  background: var(--text-primary);
}
.orbit-dot {
  position: absolute;
  left: 13%;
  top: 38%;
  width: 24%;
  height: 24%;
  border-radius: 50%;
  background: var(--color-bg-surface);
}
.artwork-brand {
  position: absolute;
  left: 8cqw;
  bottom: 10cqh;
  display: flex;
  align-items: center;
  gap: 1.7cqw;
  font-size: 2.4cqw;
  font-weight: 500;
}
.artwork-brand img {
  width: 4cqw;
  height: 4cqw;
}
</style>
