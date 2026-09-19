<script setup lang="ts">
defineProps<{
  mode: 'instant' | 'studio' | 'screenshot';
}>();
</script>

<template>
  <div class="hero-shapes" :class="`hero-shapes--${mode}`" aria-hidden="true">
    <i class="hero-sparkle hero-sparkle--top" />
    <i class="hero-sparkle hero-sparkle--top-mini" />
    <i class="hero-sparkle hero-sparkle--left" />
    <i class="hero-sparkle hero-sparkle--left-mini" />
    <i class="hero-sparkle hero-sparkle--right" />
    <i class="hero-sparkle hero-sparkle--right-mini" />
    <i class="hero-sparkle hero-sparkle--demo" />
    <span class="hero-shapes__grain" />
  </div>
</template>

<style scoped>
.hero-shapes {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  --shape-a: #6557df;
  --shape-b: #b978ef;
  --shape-c: #ff9b7c;
  --shape-glow: #a56ee7;
  pointer-events: none;
}

.hero-shapes--instant {
  --shape-a: #ff5037;
  --shape-b: #ff8a55;
  --shape-c: #ff72a2;
  --shape-glow: #ff785b;
}

.hero-shapes--screenshot {
  --shape-a: #00896c;
  --shape-b: #47bea9;
  --shape-c: #67a8f5;
  --shape-glow: #42b9ab;
}

.hero-sparkle {
  position: absolute;
  --shape-rotate: 0deg;
  --shape-drift-x: 7px;
  --shape-drift-y: -8px;
  --shape-drift-rotate: 5deg;
  --shape-soften: 2.4px;
  background:
    radial-gradient(circle at 28% 18%, rgb(255 255 255 / 95%) 0 5%, transparent 34%),
    linear-gradient(142deg, var(--shape-a) 4%, var(--shape-b) 52%, var(--shape-c) 98%);
  filter: blur(var(--shape-soften)) drop-shadow(0 0 18px color-mix(in srgb, var(--shape-glow) 48%, transparent));
  opacity: 0.48;
  transform: translate3d(0, 0, 0) rotate(var(--shape-rotate));
  animation: sparkle-drift 13s ease-in-out infinite alternate;
  -webkit-mask: url('/shapes/sparkle-asterisk.svg') center / contain no-repeat;
  mask: url('/shapes/sparkle-asterisk.svg') center / contain no-repeat;
}

.hero-sparkle::after {
  position: absolute;
  inset: 0;
  background-image: url('/textures/bayer-dither.svg');
  background-size: 16px 16px;
  content: '';
  mix-blend-mode: soft-light;
  opacity: 0.72;
}

.hero-sparkle--top {
  top: 76px;
  left: calc(50% + 338px);
  width: 38px;
  aspect-ratio: 1;
  --shape-rotate: 12deg;
}

.hero-sparkle--top-mini {
  top: 121px;
  left: calc(50% + 378px);
  width: 13px;
  aspect-ratio: 1;
  --shape-rotate: -8deg;
  --shape-soften: 1.1px;
  opacity: 0.58;
  animation-duration: 10s;
}

.hero-sparkle--left {
  top: 326px;
  left: calc(50% - 470px);
  width: 48px;
  aspect-ratio: 1;
  --shape-rotate: -11deg;
  --shape-drift-y: 7px;
  --shape-drift-rotate: -4deg;
  --shape-soften: 3px;
  -webkit-mask-image: url('/shapes/bloom-star.svg');
  mask-image: url('/shapes/bloom-star.svg');
  opacity: 0.4;
  animation-duration: 16s;
}

.hero-sparkle--left-mini {
  top: 377px;
  left: calc(50% - 422px);
  width: 15px;
  aspect-ratio: 1;
  --shape-rotate: 17deg;
  --shape-soften: 1.2px;
  opacity: 0.56;
  animation-duration: 11s;
}

.hero-sparkle--right {
  top: 384px;
  left: calc(50% + 425px);
  width: 46px;
  aspect-ratio: 1;
  --shape-rotate: 9deg;
  --shape-drift-x: -8px;
  --shape-drift-y: 6px;
  --shape-drift-rotate: -6deg;
  --shape-soften: 3px;
  -webkit-mask-image: url('/shapes/bloom-star.svg');
  mask-image: url('/shapes/bloom-star.svg');
  opacity: 0.38;
  animation-duration: 17s;
}

.hero-sparkle--right-mini {
  top: 349px;
  left: calc(50% + 402px);
  width: 14px;
  aspect-ratio: 1;
  --shape-rotate: -14deg;
  --shape-soften: 1.1px;
  opacity: 0.55;
  animation-duration: 12s;
}

.hero-sparkle--demo {
  top: 692px;
  left: calc(50% + 472px);
  width: 58px;
  aspect-ratio: 1;
  --shape-rotate: 16deg;
  --shape-drift-x: -10px;
  --shape-drift-y: -6px;
  --shape-soften: 4.2px;
  -webkit-mask-image: url('/shapes/bloom-star.svg');
  mask-image: url('/shapes/bloom-star.svg');
  opacity: 0.3;
  animation-duration: 19s;
}

.hero-shapes__grain {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgb(74 55 43 / 18%) 0 0.65px, transparent 0.9px);
  background-size: 5px 5px;
  mix-blend-mode: multiply;
  opacity: 0.16;
}

@keyframes sparkle-drift {
  from {
    transform: translate3d(0, 0, 0) rotate(var(--shape-rotate));
  }
  to {
    transform: translate3d(var(--shape-drift-x), var(--shape-drift-y), 0)
      rotate(calc(var(--shape-rotate) + var(--shape-drift-rotate)));
  }
}

@media (max-width: 700px) {
  .hero-sparkle--top {
    top: 132px;
    right: 28px;
    left: auto;
    width: 29px;
  }

  .hero-sparkle--top-mini {
    top: 168px;
    right: 21px;
    left: auto;
  }

  .hero-sparkle--left,
  .hero-sparkle--left-mini,
  .hero-sparkle--right-mini {
    display: none;
  }

  .hero-sparkle--right {
    top: 475px;
    right: -8px;
    left: auto;
    width: 35px;
  }

  .hero-sparkle--demo {
    top: auto;
    right: 10px;
    bottom: 10%;
    left: auto;
    width: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-sparkle {
    animation: none;
  }
}
</style>
