<script setup lang="ts">
import type { CursorPackDescriptor } from '~/api/types/cursor-pack';
import type { ScreenshotCursorLayer, ScreenshotCursorUpdate } from './screenshot-layer-types';
import CursorAppearanceControls from '../properties/cursor/CursorAppearanceControls.vue';
import BigSlider from '~/ui/slider/BigSlider.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ cursor: ScreenshotCursorLayer; packs: CursorPackDescriptor[] }>();
const emit = defineEmits<{ update: [patch: ScreenshotCursorUpdate]; imported: [pack: CursorPackDescriptor] }>();
const { t } = useTranslate('CanvasPanel');
</script>
<template>
  <section class="cursor-controls">
    <CursorAppearanceControls
      @imported="emit('imported', $event)"
      still
      :selection="cursor.selection"
      :packs="packs"
      :cursor-size="cursor.size"
      :cursor-color="cursor.color"
      :enable-shadow="cursor.shadowEnabled"
      :shadow-blur="cursor.shadowBlur"
      :shadow-color="cursor.shadowColor"
      :shadow-direction="cursor.shadowDirection"
      @update:selection="emit('update', { selection: $event })"
      @update:cursor-size="emit('update', { size: $event })"
      @update:cursor-color="emit('update', { color: $event })"
      @update:enable-shadow="emit('update', { shadowEnabled: $event })"
      @update:shadow-blur="emit('update', { shadowBlur: $event })"
      @update:shadow-color="emit('update', { shadowColor: $event })"
      @update:shadow-direction="emit('update', { shadowDirection: $event })"
    />
    <BigSlider
      :model-value="cursor.rotation"
      :min="0"
      :max="360"
      :step="1"
      :default-value="0"
      :label="t('shapeRotation')"
      :format-value="(value) => `${value}°`"
      @update:model-value="emit('update', { rotation: $event })"
    />
  </section>
</template>
<style scoped>
.cursor-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
</style>
