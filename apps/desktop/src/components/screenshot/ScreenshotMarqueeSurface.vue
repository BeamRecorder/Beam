<script setup lang="ts">
import { ref } from 'vue';
import CanvasMarqueeSurface from '../editor/canvas/CanvasMarqueeSurface.vue';
import type { CanvasMarqueeSelection } from '../editor/canvas/canvas-marquee-types';
import type { ScreenshotMarqueeSurfaceProps } from './screenshot-marquee-types';
import { screenshotMarqueeTargetsInSurface } from './screenshot-marquee-geometry';
const props = defineProps<ScreenshotMarqueeSurfaceProps>();
const emit = defineEmits<{ select: [value: CanvasMarqueeSelection] }>();
const surface = ref<InstanceType<typeof CanvasMarqueeSurface> | null>(null);
const targets = () => {
  const root = surface.value?.$el as HTMLElement | undefined;
  if (!root || !props.canvas) return [];
  return screenshotMarqueeTargetsInSurface(
    props.targets(),
    props.viewport,
    props.canvas.getBoundingClientRect(),
    root.getBoundingClientRect(),
    { width: root.clientWidth, height: root.clientHeight },
  );
};
const canStartLeft = (event: PointerEvent) =>
  !props.spacePressed &&
  !props.layerAt(event) &&
  !(
    event.target instanceof Element &&
    event.target.closest('button, input, textarea, .resize-handle, .webcam-selection')
  );
</script>
<template>
  <CanvasMarqueeSurface
    ref="surface"
    class="screenshot-marquee-surface"
    :targets="targets"
    :selection="selection"
    :disabled="disabled"
    :can-start-left="canStartLeft"
    @select="emit('select', $event)"
  >
    <slot />
  </CanvasMarqueeSurface>
</template>
<style scoped>
.screenshot-marquee-surface {
  position: absolute;
  inset: 0;
}
</style>
