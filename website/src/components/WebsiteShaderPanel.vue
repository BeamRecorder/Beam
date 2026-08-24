<script setup lang="ts">
import WebsiteCommunityShader from './WebsiteCommunityShader.vue';

withDefaults(
  defineProps<{
    as?: 'section' | 'aside' | 'div';
  }>(),
  { as: 'section' },
);
</script>

<template>
  <component :is="as" class="shader-panel">
    <WebsiteCommunityShader class="shader-panel__canvas" />
    <slot />
  </component>
</template>

<style scoped>
.shader-panel {
  --shader-panel-text: #201e1a;
  --shader-panel-muted: rgba(32, 30, 26, 0.76);
  --shader-panel-scrim: rgba(255, 253, 250, 0.12);
  --shader-panel-button-border: rgba(32, 30, 26, 0.18);
  --shader-panel-button-bg: rgba(255, 253, 250, 0.58);
  --shader-panel-button-hover: rgba(255, 253, 250, 0.78);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--color-primary-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 34px 90px -40px rgba(255, 90, 31, 0.52);
  color: var(--shader-panel-text);
}

.shader-panel::after {
  position: absolute;
  z-index: -1;
  inset: 0;
  background: var(--shader-panel-scrim);
  content: '';
}

.shader-panel__canvas {
  position: absolute;
  z-index: -2;
  inset: 0;
}

:global(html.dark) .shader-panel {
  --shader-panel-text: #f5fff0;
  --shader-panel-muted: rgba(245, 255, 240, 0.78);
  --shader-panel-scrim: rgba(23, 22, 19, 0.34);
  --shader-panel-button-border: rgba(255, 255, 255, 0.22);
  --shader-panel-button-bg: rgba(3, 39, 29, 0.5);
  --shader-panel-button-hover: rgba(3, 39, 29, 0.72);
}
</style>
