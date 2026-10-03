<script setup lang="ts">
import { inject, onBeforeUnmount } from 'vue';
import { editorSearchKey } from './search/editor-search-types';
import { Redo2, Undo2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
const props = withDefaults(
  defineProps<{
    canUndo: boolean;
    canRedo: boolean;
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  }>(),
  { tooltipPosition: 'bottom' },
);
const emit = defineEmits<{ undo: []; redo: [] }>();
const { t } = useTranslate('Topbar');
const search = inject(editorSearchKey, null);
const release = search?.registerActions(() => [
  {
    id: 'action:undo',
    label: t('undoTooltip'),
    group: 'action',
    icon: Undo2,
    terms: ['undo'],
    disabled: !props.canUndo,
    run: () => emit('undo'),
  },
  {
    id: 'action:redo',
    label: t('redoTooltip'),
    group: 'action',
    icon: Redo2,
    terms: ['redo'],
    disabled: !props.canRedo,
    run: () => emit('redo'),
  },
]);
onBeforeUnmount(() => release?.());
</script>
<template>
  <div class="history-actions">
    <Button
      variant="ghost"
      size="xs"
      icon-only
      :icon="Undo2"
      :disabled="!canUndo"
      :aria-label="t('undoTooltip')"
      :tooltip="t('undoTooltip')"
      :tooltip-position="tooltipPosition"
      @click.stop="emit('undo')"
    />
    <Button
      variant="ghost"
      size="xs"
      icon-only
      :icon="Redo2"
      :disabled="!canRedo"
      :aria-label="t('redoTooltip')"
      :tooltip="t('redoTooltip')"
      :tooltip-position="tooltipPosition"
      @click.stop="emit('redo')"
    />
  </div>
</template>
<style scoped>
.history-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
  flex-shrink: 0;
}
</style>
