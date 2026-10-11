<template>
  <svg class="completion-aura" aria-hidden="true" width="100%" height="100%">
    <rect class="aura-base" pathLength="100" />
    <rect class="aura-glow" pathLength="100" />
    <rect class="aura-orbit" pathLength="100" />
  </svg>
</template>

<style scoped>
.completion-aura {
  position: absolute;
  inset: -3px;
  width: calc(100% + 6px);
  height: calc(100% + 6px);
  overflow: visible;
  pointer-events: none;
  z-index: 1;
  color: var(--color-success);
  animation: aura-arrive 220ms ease both;
}
rect {
  x: 3px;
  y: 3px;
  width: calc(100% - 6px);
  height: calc(100% - 6px);
  rx: 24px;
  fill: none;
  stroke: currentColor;
}
.aura-base {
  stroke-width: 1.5px;
  opacity: 0.55;
}
.aura-glow,
.aura-orbit {
  stroke-dasharray: 18 82;
  stroke-linecap: round;
  animation: aura-orbit 5s linear infinite;
}
.aura-glow {
  stroke-width: 5px;
  opacity: 0.22;
  filter: blur(2px);
}
.aura-orbit {
  stroke-width: 1.5px;
  opacity: 0.95;
}
@keyframes aura-orbit {
  to {
    stroke-dashoffset: -100;
  }
}
@keyframes aura-arrive {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .completion-aura,
  .aura-glow,
  .aura-orbit {
    animation: none;
  }
  .aura-glow,
  .aura-orbit {
    stroke-dasharray: none;
  }
}
</style>
