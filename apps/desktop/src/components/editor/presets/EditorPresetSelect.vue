<script setup lang="ts">
import { computed } from 'vue';
import Select from '~/ui/select/Select.vue';
import type { PresetKind } from '@beam/engine/capture/capture-mode';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import { useTranslate } from '~/i18n/useTranslate';
import EditorPresetPreview from './EditorPresetPreview.vue';

const props = withDefaults(
  defineProps<{
    document: EditorPresetDocument | null;
    kind?: PresetKind;
    source?: string;
    compact?: boolean;
    size?: 'sm' | 'lg';
    disabled?: boolean;
    label?: string;
    tooltipDisabled?: boolean;
  }>(),
  { kind: 'video', size: 'sm' },
);
const emit = defineEmits<{ select: [id: string | number]; toggle: [opened: boolean] }>();
const { t } = useTranslate('EditorPresetControls');
const options = computed(
  () =>
    props.document?.presets.map((preset) => ({
      value: preset.id,
      label: preset.id === 'default' ? t('defaultPreset') : preset.name,
    })) ?? [],
);
const active = computed(() => props.document?.presets.find((preset) => preset.id === props.document?.activePresetId));
const presets = computed(() => new Map(props.document?.presets.map((preset) => [preset.id, preset]) ?? []));
</script>

<template>
  <Select
    :model-value="document?.activePresetId ?? null"
    :options="options"
    :size="compact ? 'compact' : size"
    :option-height="compact ? 54 : 70"
    :disabled="disabled || !document"
    :label="label ?? t('select')"
    :placeholder="t('preset')"
    :tooltip-disabled="tooltipDisabled"
    @update:model-value="emit('select', $event)"
    @toggle="emit('toggle', $event)"
  >
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template #preview>
      <EditorPresetPreview
        v-if="active"
        class="trigger-preview"
        :settings="active.settings"
        :kind="kind"
        :source="source"
      />
    </template>
    <template #option="{ option }">
      <EditorPresetPreview
        v-if="presets.has(String(option.value))"
        :class="{ 'compact-preview': compact }"
        :settings="presets.get(String(option.value))!.settings"
        :kind="kind"
        :source="source"
      />
      <span class="preset-option-label">{{ option.label }}</span>
    </template>
  </Select>
</template>

<style scoped>
.trigger-preview {
  width: 32px;
  height: 18px;
  border-radius: 3px;
}
.compact-preview {
  width: 72px;
  height: 40px;
}
.preset-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
