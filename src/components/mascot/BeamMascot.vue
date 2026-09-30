<script setup lang="ts">
import { toRef } from 'vue';
import MascotSvg from '../mascot-lab/MascotSvg.vue';
import { useBeamMascot } from './useBeamMascot';
import type { MascotPhase } from './mascot-types';

const props = withDefaults(defineProps<{ phase: MascotPhase; size?: number; active?: boolean }>(), {
  size: 48,
  active: true,
});
const { motion } = useBeamMascot(toRef(props, 'phase'), toRef(props, 'active'));
</script>

<template>
  <span class="beam-mascot" :data-phase="phase" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <MascotSvg
      class="mascot-artwork"
      :style="{ transform: motion.transform }"
      :frame="motion.frame"
      :size="size"
      color="var(--color-primary)"
      paper="var(--color-bg-element)"
      blush
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
