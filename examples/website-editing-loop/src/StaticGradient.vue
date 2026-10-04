<script setup lang="ts">
import { onMounted, ref } from "vue";
import { GRADIENT_PRESETS } from "../../../packages/engine/src/gradient/gradient-presets";
import { GradientRenderer } from "../../../packages/runtime/src/gradient/gradient-renderer";
import { gradientProjection } from "../../../packages/runtime/src/gradient/gradient-projection";

const props = withDefaults(defineProps<{ presetId?: string }>(), {
  presetId: "ember",
});
const canvas = ref<HTMLCanvasElement | null>(null);
onMounted(() => {
  const target = canvas.value!;
  const context = target.getContext("2d");
  if (!context) throw new Error("The static gradient canvas is unavailable.");
  const preset = GRADIENT_PRESETS.find(
    (preset) => preset.id === props.presetId,
  );
  if (!preset) throw new Error(`Unknown Beam gradient: ${props.presetId}`);
  const recipe = preset.recipe;
  const renderer = new GradientRenderer();
  try {
    const { width, height } = target;
    context.drawImage(
      renderer.render(
        recipe,
        width,
        height,
        gradientProjection(
          { x: 0, y: 0, width, height, rotation: 0 },
          { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        ),
        { width, height },
        1,
      ),
      0,
      0,
    );
  } finally {
    // Keep the completed bitmap; the fixed background needs no ongoing GPU work.
    renderer.dispose();
  }
});
</script>

<template>
  <canvas
    ref="canvas"
    class="static-gradient"
    :data-preset="presetId"
    width="1280"
    height="800"
    aria-hidden="true"
  />
</template>

<style scoped>
.static-gradient {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
