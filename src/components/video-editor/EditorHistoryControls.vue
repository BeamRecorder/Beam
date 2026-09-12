<script setup lang="ts">
import { Redo2, Undo2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
withDefaults(
  defineProps<{
    canUndo: boolean;
    canRedo: boolean;
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  }>(),
  { tooltipPosition: 'bottom' },
);
const emit = defineEmits<{ undo: []; redo: [] }>();
const { t } = useTranslate('Topbar');
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
