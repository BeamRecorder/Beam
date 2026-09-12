<script setup lang="ts">
import { useTranslate } from '~/i18n/useTranslate';
import { computed, ref } from 'vue';
import { Clapperboard, ScanLine, Plus, Save, Pencil, Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import Popover from '~/ui/popover/Popover.vue';
import ConfirmDialog from '~/ui/dialog/ConfirmDialog.vue';
import TextInputDialog from '~/ui/dialog/TextInputDialog.vue';
import type { EditorPresetDocument } from '~/api/types/editor-preset';
import type { PresetKind } from '~/api/types/capture-mode';

const { t } = useTranslate('EditorPresetControls');
const props = defineProps<{
  document: EditorPresetDocument | null;
  dirty: boolean;
  kind?: PresetKind;
}>();
const emit = defineEmits<{
  select: [id: string | number];
  add: [name: string];
  rename: [name: string];
  delete: [];
  save: [];
}>();
const active = computed(() => props.document?.presets.find((preset) => preset.id === props.document?.activePresetId));
const options = computed(
  () =>
    props.document?.presets.map(({ id, name }) => ({
      value: id,
      label: id === 'default' ? t('defaultPreset') : name,
    })) ?? [],
);
const presetPopover = ref<InstanceType<typeof Popover> | null>(null);
const nameDialog = ref<'create' | 'rename' | null>(null);
const deletingPreset = ref<EditorPresetDocument['presets'][number] | null>(null);
const dialogTitle = computed(() => (nameDialog.value === 'rename' ? t('renameTitle') : t('newTitle')));
const dialogConfirmLabel = computed(() => (nameDialog.value === 'rename' ? t('rename') : t('create')));
const dialogInitialValue = computed(() => (nameDialog.value === 'rename' ? (active.value?.name ?? '') : ''));

const openCreateDialog = () => {
  presetPopover.value?.close();
  nameDialog.value = 'create';
};

const openRenameDialog = () => {
  if (!active.value || active.value.protected) return;
  presetPopover.value?.close();
  nameDialog.value = 'rename';
};

const openDeleteDialog = () => {
  if (!active.value || active.value.protected) return;
  deletingPreset.value = { ...active.value };
};

const confirmDelete = () => {
  if (deletingPreset.value?.id === active.value?.id && !active.value?.protected) emit('delete');
  deletingPreset.value = null;
};

const validateName = (name: string) => {
  const duplicate = props.document?.presets.some((preset) => {
    if (nameDialog.value === 'rename' && preset.id === active.value?.id) return false;
    return preset.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0;
  });
  return duplicate ? t('duplicate') : null;
};

const confirmName = (name: string) => {
  const normalizedName = name.trim();
  if (!normalizedName || validateName(normalizedName)) return;
  if (nameDialog.value === 'create') emit('add', normalizedName);
  if (nameDialog.value === 'rename') emit('rename', normalizedName);
  nameDialog.value = null;
};
</script>

<template>
  <Popover
    ref="presetPopover"
    align="right"
    :match-trigger-width="false"
    :close-on-window-blur="false"
    class="preset-controls"
    :class="{ dirty }"
  >
    <template #trigger="{ isOpen }">
      <Button
        size="xs"
        variant="secondary"
        :icon="kind === 'screenshot' ? ScanLine : Clapperboard"
        class="preset-trigger"
        style="height: 28px; max-width: 180px"
        :aria-label="t('editorPreset')"
        :aria-expanded="isOpen"
      >
        <span class="preset-name">{{
          active?.id === 'default' ? t('defaultPreset') : (active?.name ?? t('preset'))
        }}</span>
        <span v-if="dirty" class="dirty-dot" :title="t('unsaved')" :aria-label="t('unsaved')" />
      </Button>
    </template>

    <section class="preset-popover" :aria-label="t('settings')" @click.stop>
      <header>
        <div>
          <strong>{{ t('preset') }}</strong>
          <span v-if="dirty">{{ t('unsaved') }}</span>
        </div>
        <Button size="xs" variant="ghost" :icon="Plus" :aria-label="t('add')" @click="openCreateDialog">{{
          t('new')
        }}</Button>
      </header>
      <Select
        :model-value="document?.activePresetId ?? null"
        :options="options"
        size="sm"
        :aria-label="t('select')"
        @update:model-value="emit('select', $event)"
      />
      <footer>
        <div class="common-actions">
          <Button
            size="xs"
            variant="ghost"
            :icon="Pencil"
            icon-only
            :tooltip="t('renameTitle')"
            :aria-label="t('renameTitle')"
            :disabled="!active || active.protected"
            @click="openRenameDialog"
          />
          <Button
            size="xs"
            variant="ghost"
            :icon="Trash2"
            icon-only
            :tooltip="t('deleteTitle')"
            class="delete-action"
            :aria-label="t('deleteTitle')"
            :disabled="!active || active.protected"
            @click="openDeleteDialog"
          />
        </div>
        <Button
          size="xs"
          variant="primary"
          :icon="Save"
          class="save-action"
          :aria-label="t('saveTitle')"
          :disabled="!active || !dirty"
          @click="emit('save')"
          >{{ t('save') }}</Button
        >
      </footer>
    </section>
    <ConfirmDialog
      :cancel-label="t('cancel')"
      :is-open="deletingPreset !== null"
      :title="t('deleteConfirm')"
      :description="t('deleteDescription', { name: deletingPreset?.name ?? '' })"
      :confirm-label="t('delete')"
      destructive
      @close="deletingPreset = null"
      @confirm="confirmDelete"
    />
  </Popover>

  <TextInputDialog
    :is-open="nameDialog !== null"
    :title="dialogTitle"
    :initial-value="dialogInitialValue"
    :label="t('name')"
    :placeholder="t('placeholder')"
    :confirm-label="dialogConfirmLabel"
    :validate="validateName"
    @close="nameDialog = null"
    @confirm="confirmName"
  />
</template>

<style scoped>
.preset-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-popover {
  width: 300px;
  max-width: calc(100vw - 18px);
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.preset-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.preset-popover header > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.preset-popover header span {
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.preset-popover footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}
.common-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.save-action {
  flex-shrink: 0;
  margin-left: auto;
}
.delete-action:hover:not(:disabled) {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 14%, transparent);
}
.dirty-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
}
</style>
