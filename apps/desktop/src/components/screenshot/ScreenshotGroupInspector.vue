<script setup lang="ts">
import { ref } from 'vue';
import Accordion from '~/ui/accordion/Accordion.vue';
import TransformControls from '../editor/properties/shared/TransformControls.vue';
import MediaOrientationControls from '../editor/properties/shared/MediaOrientationControls.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useScreenshotGroupTransform } from './useScreenshotGroupTransform';
import type { ScreenshotGroupInspectorProps } from './screenshot-group-inspector-types';

const props = defineProps<ScreenshotGroupInspectorProps>();
const { t } = useTranslate('ClipPropertiesPanel');
const open = ref(true);
const { t: transformText } = useTranslate('TransformControls');
const { state, selectedIds, busy, cropping } = props.editor;
const { editable, canRotate, rotation, transform, rotate } = useScreenshotGroupTransform(
  state,
  selectedIds,
  () => props.bounds,
  () => busy.value || cropping.value,
);
</script>
<template>
  <fieldset class="group-properties" data-screenshot-group-inspector :disabled="!editable">
    <Accordion v-model="open" :title="t('placement')" appearance="inspector">
      <TransformControls
        v-if="bounds && state"
        :model-value="bounds"
        :canvas-size="state.canvas"
        @update:model-value="transform"
      />
      <div v-if="canRotate" class="rotation-row">
        <span class="rotation-label">{{ transformText('rotation') }}</span>
        <MediaOrientationControls :rotation="rotation" :show-mirroring="false" @update:rotation="rotate" />
      </div>
    </Accordion>
  </fieldset>
</template>
<style scoped>
.group-properties {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.group-properties:disabled {
  opacity: 0.65;
}
.rotation-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.rotation-label {
  color: var(--text-secondary);
  font-size: var(--font-size-body);
  overflow-wrap: anywhere;
}
</style>
