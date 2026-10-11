<script setup lang="ts">
import { computed } from 'vue';
import { MACOS_CURSOR_PACK } from '../../../apps/desktop/src/components/editor/properties/cursor/cursor-packs';
import { cursorGeometry, resolveCursorAsset } from '../../../packages/engine/src/shared/cursor-assets';
import { pointerAt, contentOpacity } from './motion';
import type { DemoMode } from './demo-types';
import arrow from '../assets/macos-arrow.svg';
const props = defineProps<{ mode: Exclude<DemoMode, 'hero'>; time: number }>();
const geometry = cursorGeometry(
  resolveCursorAsset(MACOS_CURSOR_PACK, {
    packId: MACOS_CURSOR_PACK.id,
    mode: 'fixed',
    cursorId: 'default',
  }),
  28,
);
const style = computed(() => {
  const p = pointerAt(props.mode, props.time);
  return {
    opacity: contentOpacity(props.time),
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    transformOrigin: `${geometry.hotspot.x}px ${geometry.hotspot.y}px`,
    transform: `translate3d(${p.x - geometry.hotspot.x}px,${p.y - geometry.hotspot.y}px,0) scale(${p.scale})`,
  };
});
</script>
<template>
  <Teleport to="body">
    <img class="demo-cursor" :src="arrow" :style="style" :data-time="time" alt="" aria-hidden="true" />
  </Teleport>
</template>
<style scoped>
.demo-cursor {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 30000;
  pointer-events: none;
  filter: drop-shadow(0 1px 1px #0004);
}
</style>
