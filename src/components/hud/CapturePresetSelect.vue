<script setup lang="ts">
import { useTranslate } from '~/i18n/useTranslate';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { capture } from '~/api/capture';
import Select from '~/ui/select/Select.vue';
import { Clapperboard, ScanLine } from '@lucide/vue';
import type { PresetKind } from '~/api/types/capture-mode';
import type { EditorPresetDocument } from '~/api/types/editor-preset';

const { t } = useTranslate('QuickSnipCropBar');

const props = defineProps<{ kind: PresetKind; disabled?: boolean }>();
const document = ref<EditorPresetDocument | null>(null);
const error = ref('');
const busy = ref(false);
let generation = 0;
let unsubscribe: (() => void) | null = null;
const options = computed(
  () =>
    document.value?.presets.map((preset) => ({
      label: preset.id === 'default' ? t('defaultPreset') : preset.name,
      value: preset.id,
    })) ?? [{ label: t('defaultPreset'), value: 'default' }],
);
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
onBeforeUnmount(() => {
  generation++;
  unsubscribe?.();
});
</script>

<template>
  <div class="preset-control">
    <component :is="kind === 'screenshot' ? ScanLine : Clapperboard" :size="17" aria-hidden="true" />
    <Select
      :model-value="document?.activePresetId ?? 'default'"
      :options="options"
      :disabled="disabled || busy"
      :aria-label="t('preset')"
      @update:model-value="select"
    />
    <p v-if="error" role="alert">{{ error }}</p>
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
p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--color-error);
  font-size: 12px;
}
</style>
