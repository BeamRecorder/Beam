<script setup lang="ts">
import { ArrowRight, Shapes, Type, Pencil, MousePointer2, Image, Focus, CircleDashed, Palette } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Divider from '~/ui/divider/Divider.vue';
import ShapeLayerPropertiesPanel from '../properties/clip/ShapeLayerPropertiesPanel.vue';
import DrawingControls from './DrawingControls.vue';
import { useElementEditor } from './useElementEditor';
import { useTranslate } from '~/i18n/useTranslate';
const editor = useElementEditor();
defineProps<{ disabled?: boolean }>();
const { t } = useTranslate('Elements');
const { t: tHighlight } = useTranslate('Highlight');
const { t: tTimeline } = useTranslate('TimelineToolbar');
const { t: tCanvas } = useTranslate('CanvasPanel');
const tools = [
  { family: 'shape', icon: Shapes },
  { family: 'arrow', icon: ArrowRight },
  { family: 'text', icon: Type },
  { family: 'drawing', icon: Pencil },
] as const;
const icons = { shape: Shapes, arrow: ArrowRight, text: Type, drawing: Pencil };
</script>
<template>
  <section v-if="editor" class="elements-panel">
    <div class="element-tools">
      <slot name="tools" />
      <Button
        v-for="tool in tools"
        :key="tool.family"
        block
        size="sm"
        :icon="tool.icon"
        :disabled="disabled || !editor.canInteract.value"
        :variant="tool.family === 'drawing' && editor.drawingMode.value ? 'primary' : 'secondary'"
        @click="editor.add(tool.family)"
        >{{ t(tool.family) }}</Button
      >
      <Button
        v-if="editor.addHighlight"
        block
        size="sm"
        variant="secondary"
        :icon="Focus"
        :disabled="disabled"
        @click="editor.addHighlight()"
        >{{ tHighlight('title') }}</Button
      >
      <Button
        v-if="editor.addBlur"
        block
        size="sm"
        variant="secondary"
        :icon="CircleDashed"
        :disabled="disabled"
        @click="editor.addBlur()"
        >{{ tTimeline('blur') }}</Button
      >
      <Button
        v-if="editor.addColor"
        block
        size="sm"
        variant="secondary"
        :icon="Palette"
        :disabled="disabled"
        @click="editor.addColor()"
        >{{ tCanvas('color') }}</Button
      >
      <Button
        block
        size="sm"
        variant="secondary"
        :icon="Image"
        :disabled="disabled || !editor.addImage"
        @click="editor.addImage?.()"
        >{{ t('image') }}</Button
      >
    </div>
    <template v-if="editor.drawingMode.value">
      <p class="hint">{{ t('drawHint') }}</p>
      <DrawingControls :model-value="editor.drawingSettings.value" @update:model-value="editor.updateDrawingSettings" />
      <Button :icon="MousePointer2" size="sm" variant="secondary" @click="editor.drawingMode.value = false">{{
        t('finishDrawing')
      }}</Button>
    </template>
    <div v-if="editor.showLayers && editor.layers.value.length" class="element-layers">
      <Button
        v-for="(layer, index) in editor.layers.value"
        :key="layer.id"
        block
        size="sm"
        :variant="editor.selected.value?.id === layer.id ? 'secondary' : 'ghost'"
        :icon="icons[layer.family]"
        @click="editor.select(layer.id)"
        >{{ layer.text?.content || `${t(layer.family)} ${index + 1}` }}</Button
      >
    </div>
    <template v-if="editor.selected.value && !editor.drawingMode.value">
      <Divider />
      <ShapeLayerPropertiesPanel :clip="editor.selected.value" @update="editor.update" />
    </template>
  </section>
</template>
<style scoped>
.elements-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.element-tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.element-layers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}
.hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
</style>
