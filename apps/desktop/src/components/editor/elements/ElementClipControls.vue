<script setup lang="ts">
import { MousePointer2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import DrawingControls from './DrawingControls.vue';
import ShapeLayerPropertiesPanel from '../properties/clip/ShapeLayerPropertiesPanel.vue';
import { useElementEditor } from './useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
withDefaults(defineProps<{ showProperties?: boolean }>(), {
  showProperties: true,
});
const editor = useElementEditor();
const { t } = useTranslate('Elements');
</script>

<template>
  <section v-if="editor" class="element-clip-controls">
    <template v-if="editor.drawingMode.value">
      <p>
        {{ t(editor.anchorDraft.value !== null ? 'drawArrowHint' : 'drawHint') }}
      </p>
      <DrawingControls
        :hide-smoothing="editor.anchorDraft.value !== null"
        :model-value="editor.drawingSettings.value"
        @update:model-value="editor.updateDrawingSettings"
      />
      <Button :icon="MousePointer2" size="sm" variant="secondary" @click="editor.finishDrawing">{{
        t('finishDrawing')
      }}</Button>
    </template>
    <ShapeLayerPropertiesPanel
      v-else-if="showProperties && editor.selected.value"
      :clip="editor.selected.value"
      @update="editor.update"
    />
  </section>
</template>

<style scoped>
.element-clip-controls {
  display: grid;
  gap: 12px;
}
p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
