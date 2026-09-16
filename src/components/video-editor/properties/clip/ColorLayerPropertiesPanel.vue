<script setup lang="ts">
import Divider from '~/ui/divider/Divider.vue';
import type { ColorClip } from '~/media/shared/composition-types';
import type { ColorFill } from '~/media/shared/color-fill-types';
import type { ColorLayerStyle } from '~/media/shared/color-layer-style-types';
import ColorFillPresetControls from '../ColorFillPresetControls.vue';
import ColorLayerAppearanceControls from './ColorLayerAppearanceControls.vue';

defineProps<{ clip: ColorClip }>();
const emit = defineEmits<{
  (event: 'update', fill: ColorFill): void;
  (event: 'update:style', patch: Partial<ColorLayerStyle>): void;
  (event: 'corner-radius-interaction', interacting: boolean): void;
}>();
</script>

<template>
  <section class="color-layer-panel">
    <ColorFillPresetControls :model-value="clip.fill" @update:model-value="emit('update', $event)" />
    <Divider spacing="xs" />
    <ColorLayerAppearanceControls
      :clip="clip"
      @update="emit('update:style', $event)"
      @corner-radius-interaction="emit('corner-radius-interaction', $event)"
    />
  </section>
</template>

<style scoped>
.color-layer-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
