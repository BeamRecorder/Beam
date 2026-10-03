<script setup lang="ts">
import { toRef } from 'vue';
import BeamySvg from './BeamySvg.vue';
import { useBeamy } from './useBeamy';
import type { BeamyPhase } from './beamy-types';

const props = withDefaults(
  defineProps<{
    phase: BeamyPhase;
    size?: number;
    active?: boolean;
    portrait?: boolean;
    cycleOffset?: number;
  }>(),
  {
    size: 48,
    active: true,
    portrait: false,
    cycleOffset: 0,
  },
);
const { motion } = useBeamy(toRef(props, 'phase'), toRef(props, 'active'), toRef(props, 'cycleOffset'));
</script>

<template>
  <span class="beam-mascot" :data-phase="phase" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <BeamySvg
      class="mascot-artwork"
      :style="{ transform: motion.transform }"
      :frame="motion.frame"
      :size="size"
      :portrait="portrait"
      color="var(--color-primary)"
      paper="var(--color-bg-element)"
    />
    <span v-if="phase === 'recording'" class="recording-light" />
  </span>
</template>

<style scoped>
.beam-mascot {
  position: relative;
  display: inline-flex;
  flex: none;
  vertical-align: middle;
  pointer-events: none;
  overflow: hidden;
}
.mascot-artwork {
  display: block;
  transform-origin: center;
}
.recording-light {
  position: absolute;
  inset: 15% 14% auto auto;
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  box-shadow: 0 0 0 2px var(--color-bg-element);
}
</style>
