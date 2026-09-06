<script setup lang="ts">
import { useId } from 'vue';
import { Lock } from '@lucide/vue';
const patternId = `timeline-lock-${useId()}`;
</script>
<template>
  <span class="timeline-lock-overlay" aria-hidden="true">
    <svg width="100%" height="100%">
      <defs>
        <pattern :id="patternId" width="64" height="40" patternUnits="userSpaceOnUse">
          <path d="M-10 10L10-10M0 40L40 0M30 50L70 10" fill="none" stroke="currentColor" opacity="0.12" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" :fill="`url(#${patternId})`" />
    </svg>
    <Lock class="duration-lock-icon" :size="16" />
  </span>
</template>
<style scoped>
.timeline-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--color-bg-element) 25%, transparent);
}
.duration-lock-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate3d(-50%, -50%, 0);
  opacity: 0.65;
}
</style>
