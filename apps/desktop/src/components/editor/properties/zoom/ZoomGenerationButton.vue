<script setup lang="ts">
import { computed } from 'vue';
import { Sparkles } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { ZoomGenerationButtonProps } from './zoom-panel-types';

const props = defineProps<ZoomGenerationButtonProps>();
const emit = defineEmits<{ click: [] }>();
const { t } = useTranslate('ZoomPanel');
const label = computed(() => t(props.hasAutomaticZooms ? 'regenerateAutoZooms' : 'generateAutoZooms'));
const hint = computed(() => {
  if (props.canGenerate) return undefined;
  if (!props.editorData?.sessionId) return t('autoZoomNoRecording');
  if (!props.editorData.cursor.available) return t('autoZoomNoCursor');
  return t('autoZoomNoClicks');
});
</script>

<template>
  <Tooltip
    class="zoom-generation-button"
    :content="hint"
    :disabled="canGenerate"
    :delay="300"
    :tabindex="canGenerate ? undefined : 0"
    :role="canGenerate ? undefined : 'group'"
    :aria-label="canGenerate ? undefined : label"
    :aria-description="hint"
    :aria-disabled="canGenerate ? undefined : true"
  >
    <Button
      variant="secondary"
      size="sm"
      :icon="Sparkles"
      :disabled="!canGenerate"
      :aria-description="hint"
      block
      @click="canGenerate && emit('click')"
      >{{ label }}</Button
    >
  </Tooltip>
</template>

<style scoped>
.zoom-generation-button {
  display: flex;
  width: 100%;
  border-radius: var(--radius-md);
}
.zoom-generation-button:focus-visible {
  outline: 2px solid var(--text-secondary);
  outline-offset: 2px;
}
</style>
