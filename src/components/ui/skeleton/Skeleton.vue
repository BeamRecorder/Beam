<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'linear' | 'radial' | 'animated-gradient';
    width?: string;
    height?: string;
    radius?: string;
  }>(),
  {
    variant: 'linear',
    width: '100%',
    height: '20px',
    radius: 'var(--radius-sm)',
  },
);

const skeletonStyle = computed(() => ({
  width: props.width,
  height: props.height,
  borderRadius: props.radius,
}));
</script>

<template>
  <div class="skeleton" :class="`shimmer-${variant}`" :style="skeletonStyle">
    <div v-if="variant === 'animated-gradient'" class="skeleton-surface" aria-hidden="true">
      <div class="skeleton-aurora" aria-hidden="true"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton {
  display: block;
  background-color: var(--color-bg-element);
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-sm);
}

/* Hardware accelerated sliding shimmer */
.skeleton::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.12) 35%,
    rgba(255, 255, 255, 0.28) 50%,
    rgba(255, 255, 255, 0.12) 65%,
    transparent 100%
  );
  animation: shimmer-slide 1.4s infinite cubic-bezier(0.4, 0, 0.2, 1);
}

.shimmer-animated-gradient {
  --skeleton-base: color-mix(in srgb, var(--color-bg-surface) 88%, var(--color-border));
  --skeleton-highlight: rgb(255 255 255 / 0.48);
  --skeleton-secondary: rgb(174 168 157 / 0.22);
  --skeleton-mid: rgb(167 161 150 / 0.12);
  --skeleton-shadow: rgb(112 106 96 / 0.1);
  --skeleton-deep: rgb(128 120 108 / 0.12);

  isolation: isolate;
  background: var(--skeleton-base);
}

.shimmer-animated-gradient::after {
  inset: -38% auto -38% -28%;
  width: 72%;
  transform: translate3d(-8%, -4%, 0) scale(1);
  border-radius: 50%;
  background: radial-gradient(ellipse, var(--skeleton-secondary), transparent 68%);
  filter: blur(48px);
  animation: skeleton-secondary-drift 5.6s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
  will-change: transform;
}

.skeleton-surface,
.skeleton-aurora {
  position: absolute;
  pointer-events: none;
}

.skeleton-surface {
  inset: -18%;
  transform: scale(1.12) translate3d(-2%, 1%, 0);
  background:
    radial-gradient(ellipse at 18% 28%, var(--skeleton-highlight) 0%, transparent 44%),
    radial-gradient(ellipse at 78% 70%, var(--skeleton-shadow) 0%, transparent 48%),
    linear-gradient(140deg, var(--skeleton-base), var(--skeleton-mid) 52%, var(--skeleton-base));
  filter: blur(32px);
  animation: skeleton-drift 5.2s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
  will-change: transform;
}

.skeleton-aurora {
  inset: -16%;
  background:
    radial-gradient(ellipse at 66% 20%, var(--skeleton-highlight) 0%, transparent 40%),
    radial-gradient(ellipse at 34% 78%, var(--skeleton-shadow) 0%, transparent 44%);
  filter: blur(40px);
  animation: skeleton-cloud 6.4s ease-in-out infinite alternate-reverse;
  will-change: transform, opacity;
}

:global(.dark) .shimmer-animated-gradient {
  --skeleton-base: color-mix(in srgb, var(--color-bg-surface) 72%, rgb(9 11 14));
  --skeleton-highlight: rgb(216 220 228 / 0.09);
  --skeleton-secondary: rgb(112 118 129 / 0.16);
  --skeleton-mid: rgb(110 115 125 / 0.08);
  --skeleton-shadow: rgb(63 68 77 / 0.08);
  --skeleton-deep: rgb(5 7 10 / 0.34);
}

:global(:root:not(.dark)) .skeleton:not(.shimmer-animated-gradient)::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 0, 0, 0.04) 35%,
    rgba(0, 0, 0, 0.1) 50%,
    rgba(0, 0, 0, 0.04) 65%,
    transparent 100%
  );
}

@keyframes shimmer-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

@keyframes skeleton-drift {
  from {
    transform: scale(1.14) translate3d(-9%, 6%, 0) rotate(-2deg);
  }
  to {
    transform: scale(1.22) translate3d(9%, -6%, 0) rotate(2deg);
  }
}

@keyframes skeleton-cloud {
  from {
    opacity: 0.48;
    transform: scale(1.04) translate3d(5%, -4%, 0);
  }
  to {
    opacity: 0.78;
    transform: scale(1.18) translate3d(-6%, 5%, 0);
  }
}

@keyframes skeleton-secondary-drift {
  from {
    opacity: 0.58;
    transform: translate3d(-8%, -4%, 0) scale(1);
  }
  to {
    opacity: 0.92;
    transform: translate3d(88%, 12%, 0) scale(1.16);
  }
}
</style>
