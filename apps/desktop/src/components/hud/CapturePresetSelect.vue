<script setup lang="ts">
import { useTranslate } from '~/i18n/useTranslate';
import { defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import { capture } from '~/api/capture';
import EditorPresetSelect from '../editor/presets/EditorPresetSelect.vue';
import Tooltip from '~/ui/tooltip/Tooltip.vue';
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
const CapturePresetPreview = defineAsyncComponent(() => import('./CapturePresetPreview.vue'));

const { t } = useTranslate('QuickSnipCropBar');

const props = defineProps<{
  kind: PresetKind;
  disabled?: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{
  toggle: [opened: boolean];
  error: [message: string];
}>();
const document = ref<EditorPresetDocument | null>(null);
const error = ref('');
const busy = ref(false);
watch(error, (message) => emit('error', message));
let generation = 0;
let unsubscribe: (() => void) | null = null;
watch(
  () => props.kind,
  async (kind) => {
    const current = ++generation;
    unsubscribe?.();
    unsubscribe = capture.onEditorPresetsChanged((next) => {
      if (current === generation) document.value = next;
    }, kind);
    document.value = null;
    error.value = '';
    busy.value = true;
    try {
      const next = await capture.getEditorPresets(kind);
      if (current === generation) document.value = next;
    } catch (reason) {
      if (current === generation) error.value = String(reason);
    } finally {
      if (current === generation) busy.value = false;
    }
  },
  { immediate: true },
);
const select = async (id: string | number) => {
  const current = generation;
  busy.value = true;
  error.value = '';
  try {
    const next = await capture.selectEditorPreset(String(id), props.kind);
    if (current === generation) document.value = next;
  } catch (reason) {
    if (current === generation) error.value = String(reason);
  } finally {
    if (current === generation) busy.value = false;
  }
};
const presetFor = (id: string | number) => document.value?.presets.find((preset) => preset.id === id);
onBeforeUnmount(() => {
  emit('error', '');
  generation++;
  unsubscribe?.();
});
</script>

<template>
  <div class="preset-control" :class="{ compact }">
    <CaptureModeIcon v-if="!compact" :mode="kind === 'screenshot' ? 'screenshot' : 'studio'" :size="17" decorative />
    <EditorPresetSelect
      :document="document"
      :kind="kind"
      :compact="compact"
      size="lg"
      :disabled="disabled || busy"
      :label="t('preset')"
      tooltip-disabled
      show-preview-indicator
      @select="select"
      @toggle="emit('toggle', $event)"
    >
      <template #option-label="{ option, previewing }">
        <Tooltip class="preset-option-label" :open="previewing" position="left">
          <span :title="option.label">{{ option.label }}</span>
          <template v-if="previewing && presetFor(option.value)" #content>
            <CapturePresetPreview :preset="presetFor(option.value)!" :kind="kind" />
          </template>
        </Tooltip>
      </template>
      <template v-if="compact" #icon
        ><CaptureModeIcon :mode="kind === 'screenshot' ? 'screenshot' : 'studio'" :size="14" decorative
      /></template>
    </EditorPresetSelect>
    <p v-if="error && !compact" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.preset-control {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}
.preset-control.compact {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
.preset-option-label {
  width: 100%;
  font-weight: inherit;
}
.preset-option-label > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-error);
  font-size: 12px;
}
</style>
