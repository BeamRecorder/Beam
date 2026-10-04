<script setup lang="ts">
import { Check, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
defineProps<{ hint: string; disabled?: boolean }>();
defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useTranslate('Elements');
</script>
<template>
  <div
    class="drawing-toolbar floating-surface"
    role="toolbar"
    :aria-label="t('finishDrawing')"
    @pointerdown.stop
    @click.stop
    @dblclick.stop
    @keydown.stop
  >
    <span class="hint">{{ hint }}</span>
    <Button size="sm" variant="primary" :icon="Check" :disabled="disabled" @click="$emit('confirm')">
      {{ t('applyDrawing') }} <kbd>↵</kbd>
    </Button>
    <Button
      size="sm"
      variant="ghost"
      icon-only
      :icon="X"
      :tooltip="t('cancelDrawing')"
      :aria-label="t('cancelDrawing')"
      @click="$emit('cancel')"
    />
  </div>
</template>
<style scoped>
@import '../../ui/floating-surface.css';
.drawing-toolbar {
  position: absolute;
  z-index: 1;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  max-width: calc(100% - 24px);
}
.hint {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
kbd {
  font: inherit;
  opacity: 0.7;
  margin-left: 4px;
}
</style>
