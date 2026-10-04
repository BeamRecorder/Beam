<script setup lang="ts">
import type { ClipComposition, ColorClip, ShapeClip } from '@beam/engine/shared/composition-types';
import { setColorFill, setColorLayerStyle, setShapeLayerStyle, setTransform } from '@beam/engine/commands/clip-engine';
import ColorLayerPropertiesPanel from './ColorLayerPropertiesPanel.vue';
import type { ElementLayerPatch } from '../../elements/element-editor-types';
import ShapeLayerPropertiesPanel from './ShapeLayerPropertiesPanel.vue';

const props = defineProps<{
  composition: ClipComposition;
  clip: ColorClip | ShapeClip;
  canvasSize: { width: number; height: number };
}>();
const emit = defineEmits<{
  update: [composition: ClipComposition];
  cornerRadiusInteraction: [active: boolean];
}>();
const updateShape = ({ transform, ...style }: ElementLayerPatch) => {
  const composition = transform ? setTransform(props.composition, props.clip.id, transform) : props.composition;
  emit('update', setShapeLayerStyle(composition, props.clip.id, style));
};
</script>

<template>
  <ColorLayerPropertiesPanel
    v-if="clip.kind === 'color'"
    :clip="clip"
    @update="emit('update', setColorFill(composition, clip.id, $event))"
    @update:style="emit('update', setColorLayerStyle(composition, clip.id, $event))"
    @corner-radius-interaction="emit('cornerRadiusInteraction', $event)"
  />
  <ShapeLayerPropertiesPanel v-else :clip="clip" :canvas-size="canvasSize" @update="updateShape" />
</template>
