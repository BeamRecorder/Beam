<script setup lang="ts">
import { rotateMediaVector } from '@beam/engine/layout/media-rotation';
import { beginPropertyInteraction, endPropertyInteraction } from '~/composables/property-interaction';
import { computed, onBeforeUnmount, ref } from 'vue';
import type { NormalizedCrop } from '@beam/engine/shared/composition-types';
import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ResizeCorner } from '~/ui/ResizeHandle/types';
import CanvasCropSelection from '../editor/canvas/CanvasCropSelection.vue';
import { clampNormalizedCrop } from '@beam/engine/shared/normalized-crop';
import { mirrorCrop } from '../editor/canvas/composables/layer-transform-geometry';
import { moveScreenshotCrop, screenshotCropBounds } from '@beam/engine/screenshot/screenshot-geometry';
import type { ScreenshotDimensions, ScreenshotCropDrag } from './screenshot-types';

const props = defineProps<{
  state: ScreenshotState;
  sourceSize: ScreenshotDimensions;
}>();
const emit = defineEmits<{ crop: [value: NormalizedCrop]; done: [] }>();
const container = ref<HTMLElement | null>(null);
let drag: ScreenshotCropDrag | null = null;
const mirror = (crop: NormalizedCrop) =>
  mirrorCrop(crop, Boolean(props.state.image.isMirrored), Boolean(props.state.image.isMirroredY));
const crop = computed(() => mirror(clampNormalizedCrop(props.state.image.crop ?? { x: 0, y: 0, width: 1, height: 1 })));
const full = computed(() => screenshotCropBounds(props.state, props.sourceSize.width, props.sourceSize.height));
const containerStyle = computed(() => ({
  left: `${(full.value.x / props.state.canvas.width) * 100}%`,
  top: `${(full.value.y / props.state.canvas.height) * 100}%`,
  width: `${(full.value.width / props.state.canvas.width) * 100}%`,
  height: `${(full.value.height / props.state.canvas.height) * 100}%`,
  transform: `rotate(${props.state.image.rotation ?? 0}deg)`,
}));
const overlayStyle = computed(() => ({
  left: `${crop.value.x * 100}%`,
  top: `${crop.value.y * 100}%`,
  width: `${crop.value.width * 100}%`,
  height: `${crop.value.height * 100}%`,
}));
const start = (event: PointerEvent, corner?: ResizeCorner) => {
  if (event.button !== 0) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  if (!drag) beginPropertyInteraction();
  drag = {
    x: event.clientX,
    y: event.clientY,
    initial: { ...crop.value },
    corner,
  };
};
const move = (event: PointerEvent) => {
  const bounds = container.value?.getBoundingClientRect();
  if (!drag || !bounds?.width || !bounds.height) return;
  const rotation = props.state.image.rotation ?? 0;
  const radians = (rotation * Math.PI) / 180;
  const projectedWidth =
    full.value.width * Math.abs(Math.cos(radians)) + full.value.height * Math.abs(Math.sin(radians));
  const scale = bounds.width / projectedWidth;
  const delta = rotateMediaVector({ x: event.clientX - drag.x, y: event.clientY - drag.y }, -rotation);
  emit(
    'crop',
    mirror(
      moveScreenshotCrop(
        drag.initial,
        delta.x / (full.value.width * scale),
        delta.y / (full.value.height * scale),
        drag.corner,
      ),
    ),
  );
};
const release = () => {
  if (drag) endPropertyInteraction();
  drag = null;
};
onBeforeUnmount(release);
const end = (event: PointerEvent) => {
  release();
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
};
</script>

<template>
  <div ref="container" class="crop-bounds" :style="containerStyle">
    <CanvasCropSelection
      :container-style="{ inset: '0' }"
      :overlay-style="overlayStyle"
      @move-start="start($event)"
      @move="move"
      @move-end="end"
      @resize-start="(corner, event) => start(event, corner)"
      @resize-move="move"
      @resize-end="end"
      @done="emit('done')"
    />
  </div>
</template>

<style scoped>
.crop-bounds {
  position: absolute;
  pointer-events: none;
}
</style>
