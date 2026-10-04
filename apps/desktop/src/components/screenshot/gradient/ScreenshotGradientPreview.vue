<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { GradientRenderer } from '@beam/runtime/gradient/gradient-renderer';
import type { GradientRecipe } from '@beam/engine/gradient/gradient-types';
import { useTranslate } from '~/i18n/useTranslate';
const props = defineProps<{ recipe: GradientRecipe }>();
const { t } = useTranslate('ScreenshotEditor');
const canvas = ref<HTMLCanvasElement | null>(null);
const error = ref(false);
let renderer: GradientRenderer | undefined;
watch(
  [canvas, () => props.recipe],
  () => {
    if (!canvas.value) return;
    try {
      const context = canvas.value.getContext('2d');
      if (!context) throw new Error('Gradient preview canvas is unavailable.');
      renderer ??= new GradientRenderer();
      const { width, height } = canvas.value;
      context.drawImage(
        renderer.render(props.recipe, width, height, { x: [1, 0, 0], y: [0, 1, 0] }, { width, height }, 1),
        0,
        0,
      );
      error.value = false;
    } catch {
      error.value = true;
    }
  },
  { deep: true, flush: 'post' },
);
onBeforeUnmount(() => renderer?.dispose());
</script>
<template>
  <div class="gradient-live-preview">
    <canvas ref="canvas" width="320" height="180" :hidden="error" />
    <p v-if="error" role="alert">{{ t('renderUnavailable') }}</p>
  </div>
</template>
<style scoped>
.gradient-live-preview,
canvas {
  width: 100%;
  height: 100%;
}
canvas {
  display: block;
}
p {
  margin: 0;
  padding: 12px;
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
