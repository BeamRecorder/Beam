<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Trash2, CornerUpRight, Spline, MousePointer2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Switch from '~/ui/switch/Switch.vue';
import { insertVectorNode, removeVectorNode, setVectorNodeMode } from '@beam/engine/shared/shape-vector-edit';
import { MAX_VECTOR_NODES } from '@beam/engine/shared/shape-vector-schema';
import { useTranslate } from '~/i18n/useTranslate';
import { useElementEditor } from './useElementEditor';
const editor = useElementEditor();
const { t } = useTranslate('Elements');
const vector = computed(() => editor?.selected.value?.vector);
const selection = computed(() => editor?.selectedNode.value);
const contour = computed(() => selection.value && vector.value?.contours[selection.value.contour]);
const node = computed(() => selection.value && contour.value?.nodes[selection.value.node]);
const canInsert = computed(
  () =>
    selection.value &&
    contour.value &&
    vector.value &&
    (contour.value.closed || selection.value.node < contour.value.nodes.length - 1) &&
    vector.value.contours.reduce((sum, c) => sum + c.nodes.length, 0) < MAX_VECTOR_NODES,
);
const mode = (value: 'corner' | 'smooth') => {
  if (vector.value && selection.value)
    editor?.update({ vector: setVectorNodeMode(vector.value, selection.value, value) });
};
const insert = () => {
  if (!canInsert.value || !vector.value || !selection.value) return;
  editor?.update({ vector: insertVectorNode(vector.value, selection.value) });
  editor!.selectedNode.value = { ...selection.value, node: selection.value.node + 1 };
};
const remove = () => {
  if (!vector.value || !selection.value || !contour.value || contour.value.nodes.length <= 2) return;
  const next = removeVectorNode(vector.value, selection.value);
  editor?.update({ vector: next });
  editor!.selectedNode.value = {
    ...selection.value,
    node: Math.min(selection.value.node, next.contours[selection.value.contour]!.nodes.length - 1),
  };
};
const closePath = (closed: boolean) => {
  if (!vector.value || !selection.value) return;
  editor?.update({
    vector: {
      ...vector.value,
      contours: vector.value.contours.map((c, i) => (i === selection.value!.contour ? { ...c, closed } : c)),
    },
  });
};
</script>
<template>
  <div v-if="editor && vector" class="node-controls">
    <p>{{ t('nodeHint') }}</p>
    <ButtonGroup variant="neutral" full :columns="4">
      <Button
        size="sm"
        :icon="CornerUpRight"
        icon-only
        :variant="node?.mode === 'corner' ? 'selected' : 'ghost'"
        :disabled="!node"
        :tooltip="t('cornerNode')"
        :aria-label="t('cornerNode')"
        @click="mode('corner')"
      />
      <Button
        size="sm"
        :icon="Spline"
        icon-only
        :variant="node?.mode === 'smooth' ? 'selected' : 'ghost'"
        :disabled="!node"
        :tooltip="t('smoothNode')"
        :aria-label="t('smoothNode')"
        @click="mode('smooth')"
      />
      <Button
        size="sm"
        :icon="Plus"
        icon-only
        variant="ghost"
        :disabled="!canInsert"
        :tooltip="t('insertNode')"
        :aria-label="t('insertNode')"
        @click="insert"
      />
      <Button
        size="sm"
        :icon="Trash2"
        icon-only
        variant="ghost"
        :disabled="!contour || contour.nodes.length <= 2"
        :tooltip="t('removeNode')"
        :aria-label="t('removeNode')"
        @click="remove"
      />
    </ButtonGroup>
    <div v-if="contour" class="toggle">
      <span>{{ t('closedPath') }}</span
      ><Switch :model-value="contour.closed" :aria-label="t('closedPath')" @update:model-value="closePath" />
    </div>
    <Button size="sm" variant="secondary" :icon="MousePointer2" @click="editor.finishVector">{{
      t('finishNodes')
    }}</Button>
  </div>
</template>
<style scoped>
.node-controls {
  display: grid;
  gap: 10px;
}
p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}
</style>
