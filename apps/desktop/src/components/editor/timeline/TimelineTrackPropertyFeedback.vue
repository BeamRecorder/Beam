<script setup lang="ts">
import { inject, shallowRef, watch } from 'vue';
import { cursorPropertyScopeKey } from '../properties/cursor/cursor-property-types';
import { zoomPropertyScopeKey } from '../properties/zoom/zoom-property-context';
import { clipTrackPropertyScopeKey } from '../properties/clip/clip-track-property-context';

const props = withDefaults(defineProps<{ clipId: string; kind?: 'clip' | 'zoom' }>(), { kind: 'clip' });
const scope = inject(clipTrackPropertyScopeKey, null);
const cursorScope = inject(cursorPropertyScopeKey, null);
const zoomScope = inject(zoomPropertyScopeKey, null);
const pulse = shallowRef<{ revision: number; delayMs: number } | null>(null);
watch(
  () => (props.kind === 'zoom' ? [zoomScope?.feedback.value] : [scope?.feedback.value, cursorScope?.feedback.value]),
  (values, before) => {
    const feedback = values.find((value, index) => value && value !== before[index]);
    const clip = feedback?.clips.find((entry) => entry.id === props.clipId);
    pulse.value = feedback && clip ? { revision: feedback.revision, delayMs: clip.delayMs } : null;
  },
);
</script>
<template>
  <span
    v-if="pulse"
    :key="pulse.revision"
    aria-hidden="true"
    class="track-property-feedback"
    :style="{ '--apply-delay': `${pulse.delayMs}ms` }"
    @animationend.self="pulse = null"
  />
</template>
<style scoped>
.track-property-feedback {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: var(--radius-sm);
  pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--color-primary);
  opacity: 0;
  animation: apply-property-pulse 560ms ease-out var(--apply-delay) both;
}
.track-property-feedback::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 20%,
    color-mix(in srgb, var(--color-primary) 38%, transparent) 45%,
    color-mix(in srgb, var(--text-primary) 28%, transparent) 52%,
    transparent 80%
  );
  animation: apply-property-shimmer 560ms cubic-bezier(0.16, 1, 0.3, 1) var(--apply-delay) both;
}
@keyframes apply-property-pulse {
  0% {
    opacity: 0;
  }
  20%,
  55% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes apply-property-shimmer {
  from {
    transform: translate3d(-110%, 0, 0);
  }
  to {
    transform: translate3d(110%, 0, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .track-property-feedback {
    animation: apply-property-pulse 180ms ease-out both;
  }
  .track-property-feedback::after {
    display: none;
  }
}
</style>
