<script setup lang="ts">
import { computed } from 'vue';
import type { TransformClip } from './editor-canvas-types';
import type { useLayerTransformAndCrop } from './composables/useLayerTransformAndCrop';
import CanvasLayerSelection from './CanvasLayerSelection.vue';

const props = defineProps<{
  clip: TransformClip | null;
  editingId: string | null;
  cropping?: boolean;
  manualZoom?: boolean;
  muted?: boolean;
  interaction: ReturnType<typeof useLayerTransformAndCrop>;
  rotateLabel: string;
}>();
const emit = defineEmits<{
  (event: 'pointer-down', value: PointerEvent): void;
  (event: 'rotate', value: number): void;
  (event: 'rotate-end', value: number): void;
}>();
const visible = computed(
  () =>
    props.clip &&
    props.clip.id !== props.editingId &&
    !(props.clip.kind === 'caption' && props.clip.caption.type === 'keyboard' && props.clip.caption.followCursor) &&
    !props.cropping &&
    !props.manualZoom,
);
const handleStyle = computed(() => ({
  ...props.interaction.transformHandleStyle.value,
  ...(props.clip?.kind === 'shape' && !props.interaction.transformPerspectiveCorners.value
    ? { transform: `rotate(${props.clip.rotation}deg)` }
    : {}),
}));
</script>

<template>
  <CanvasLayerSelection
    v-if="visible && clip"
    :viewport-style="interaction.transformSelectionViewportStyle.value"
    :handle-style="handleStyle"
    :muted="muted"
    :resize-corners="interaction.transformResizeCorners.value"
    :resize-handle-positions="interaction.transformHandlePositions.value"
    :perspective-corners="interaction.transformPerspectiveCorners.value"
    :rotation="clip.kind === 'shape' ? clip.rotation : 0"
    :rotatable="clip.kind === 'shape' && !interaction.transformPerspectiveCorners.value"
    :rotate-label="rotateLabel"
    @pointer-down="emit('pointer-down', $event)"
    @pointer-move="interaction.moveTransformDrag"
    @pointer-up="interaction.endTransformDrag"
    @resize-start="(corner, event) => interaction.beginTransformDrag(event, 'resize', corner)"
    @resize-move="interaction.moveTransformDrag"
    @resize-end="interaction.endTransformDrag"
    @rotate="emit('rotate', $event)"
    @rotate-end="emit('rotate-end', $event)"
  />
</template>
