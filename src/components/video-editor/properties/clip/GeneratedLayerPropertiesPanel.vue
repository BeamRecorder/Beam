<script setup lang="ts">
import type { ClipComposition, ColorClip, ShapeClip } from '~/media/shared/composition-types';
import { setColorFill, setColorLayerStyle, setShapeLayerStyle } from '../../composition/engine/clip-engine';
import ColorLayerPropertiesPanel from './ColorLayerPropertiesPanel.vue';
import ShapeLayerPropertiesPanel from './ShapeLayerPropertiesPanel.vue';

const props = defineProps<{ composition: ClipComposition; clip: ColorClip | ShapeClip }>();
const emit = defineEmits<{
  update: [composition: ClipComposition];
  cornerRadiusInteraction: [active: boolean];
}>();
</script>

<template>
  <ColorLayerPropertiesPanel
    v-if="clip.kind === 'color'"
    :clip="clip"
    @update="emit('update', setColorFill(composition, clip.id, $event))"
    @update:style="emit('update', setColorLayerStyle(composition, clip.id, $event))"
    @corner-radius-interaction="emit('cornerRadiusInteraction', $event)"
  />
  <ShapeLayerPropertiesPanel
    v-else
    :clip="clip"
    @update="emit('update', setShapeLayerStyle(composition, clip.id, $event))"
  />
</template>
