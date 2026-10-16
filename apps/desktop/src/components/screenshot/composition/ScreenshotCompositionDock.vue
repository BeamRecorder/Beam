<script setup lang="ts">
import ScreenshotCompositionHeading from './ScreenshotCompositionHeading.vue';
import { useCompositionPanelDock } from './composition-panel-dock';

const dock = useCompositionPanelDock();
</script>

<template>
  <div
    v-if="dock"
    v-show="dock.docked.value || dock.dragging.value"
    :ref="
      (node) => {
        dock!.target.value = node as HTMLElement | null;
      }
    "
    class="composition-dock-target"
    :class="{ hovered: dock.hovered.value, occupied: dock.docked.value }"
    aria-hidden="true"
  >
    <ScreenshotCompositionHeading :count="dock.count.value" collapsed compact />
  </div>
</template>

<style scoped>
.composition-dock-target {
  position: absolute;
  right: calc(100% + 8px);
  pointer-events: none;
  display: grid;
  place-items: center;
  width: 180px;
  height: 28px;
  padding: 0 8px;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  color: var(--text-primary);
  background: var(--color-bg-surface);
  transition:
    background 140ms ease,
    border-color 140ms ease;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.composition-dock-target:not(.occupied)::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px dashed var(--color-primary);
  border-radius: inherit;
  pointer-events: none;
  animation: composition-dock-hint 1200ms ease-in-out infinite;
}
@keyframes composition-dock-hint {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
.composition-dock-target.hovered {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}
.composition-dock-target.occupied {
  visibility: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .composition-dock-target {
    transition: none;
  }
  .composition-dock-target:not(.occupied)::after {
    animation: none;
    opacity: 1;
  }
}
</style>
