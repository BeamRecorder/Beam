<script setup lang="ts">
import Skeleton from '~/ui/skeleton/Skeleton.vue';
</script>

<template>
  <Skeleton
    class="onboarding-gradient"
    variant="animated-gradient"
    width="100%"
    height="100%"
    radius="0"
    aria-hidden="true"
  />
</template>

<style scoped>
.onboarding-gradient {
  --skeleton-base: color-mix(in srgb, var(--color-bg-app) 88%, var(--color-bg-surface-hover));
  --skeleton-highlight: color-mix(in srgb, var(--text-primary) 14%, transparent);
  --skeleton-secondary: color-mix(in srgb, var(--color-primary) 11%, transparent);
  --skeleton-mid: color-mix(in srgb, var(--text-secondary) 7%, transparent);
  --skeleton-shadow: color-mix(in srgb, var(--color-bg-app) 62%, transparent);
  --skeleton-deep: color-mix(in srgb, var(--color-bg-app) 78%, transparent);

  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 12% 16%, color-mix(in srgb, var(--color-primary) 6%, transparent), transparent 42%),
    var(--skeleton-base);
}

.onboarding-gradient::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-bg-app) 12%, transparent),
    transparent 38%,
    color-mix(in srgb, var(--color-bg-app) 38%, transparent)
  );
}
</style>
