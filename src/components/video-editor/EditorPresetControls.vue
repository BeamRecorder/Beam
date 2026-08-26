<script setup lang="ts">
import { computed, ref } from 'vue';
import { Layers3, Plus, Save, Pencil, Trash2 } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import Popover from '~/ui/popover/Popover.vue';
import ConfirmDialog from '~/ui/dialog/ConfirmDialog.vue';
import TextInputDialog from '~/ui/dialog/TextInputDialog.vue';
import type { EditorPresetDocument } from '~/api/types/editor-preset';

const props = defineProps<{
  document: EditorPresetDocument | null;
  dirty: boolean;
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
      label: name,
    })) ?? [],
);
type PopoverHandle = { close: () => void };
const presetPopover = ref<PopoverHandle | null>(null);
const nameDialog = ref<'create' | 'rename' | null>(null);
const deleteDialogOpen = ref(false);
const dialogTitle = computed(() => (nameDialog.value === 'rename' ? 'Rename preset' : 'New preset'));
const dialogConfirmLabel = computed(() => (nameDialog.value === 'rename' ? 'Rename' : 'Create'));
const dialogInitialValue = computed(() => (nameDialog.value === 'rename' ? (active.value?.name ?? '') : ''));

const openCreateDialog = () => {
  presetPopover.value?.close();
  nameDialog.value = 'create';
};

const openRenameDialog = () => {
  if (active.value?.protected) return;
  presetPopover.value?.close();
  nameDialog.value = 'rename';
};

const openDeleteDialog = () => {
  if (active.value?.protected) return;
  presetPopover.value?.close();
  deleteDialogOpen.value = true;
};

const confirmDelete = () => {
  emit('delete');
  deleteDialogOpen.value = false;
};

const validateName = (name: string) => {
  const duplicate = props.document?.presets.some((preset) => {
    if (nameDialog.value === 'rename' && preset.id === active.value?.id) return false;
    return preset.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0;
  });
  return duplicate ? 'A preset with this name already exists.' : null;
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
        :icon="Layers3"
        class="preset-trigger"
        aria-label="Editor preset"
        :aria-expanded="isOpen"
      >
        <span class="preset-name">{{ active?.name ?? 'Preset' }}</span>
        <span v-if="dirty" class="dirty-dot" title="Unsaved preset changes" aria-label="Unsaved preset changes" />
      </Button>
    </template>

    <section class="preset-popover" aria-label="Editor preset settings" @click.stop>
      <header>
        <div>
          <strong>Preset</strong>
          <span v-if="dirty">Unsaved changes</span>
        </div>
        <Button size="xs" variant="ghost" :icon="Plus" aria-label="Add preset" @click="openCreateDialog">New</Button>
      </header>
      <Select
        :model-value="document?.activePresetId ?? null"
        :options="options"
        size="sm"
        aria-label="Select editor preset"
        @update:model-value="emit('select', $event)"
      />
      <footer>
        <div class="common-actions">
          <Button
            size="xs"
            variant="ghost"
            :icon="Pencil"
            aria-label="Rename preset"
            :disabled="active?.protected"
            @click="openRenameDialog"
            >Rename</Button
          >
          <Button
            size="xs"
            variant="ghost"
            :icon="Trash2"
            class="delete-action"
            aria-label="Delete preset"
            :disabled="active?.protected"
            @click="openDeleteDialog"
            >Delete</Button
          >
        </div>
        <Button
          size="xs"
          variant="primary"
          :icon="Save"
          aria-label="Save preset"
          :disabled="!dirty"
          @click="emit('save')"
          >Save</Button
        >
      </footer>
    </section>
  </Popover>

  <TextInputDialog
    :is-open="nameDialog !== null"
    :title="dialogTitle"
    :initial-value="dialogInitialValue"
    label="Preset name"
    placeholder="My preset"
    :confirm-label="dialogConfirmLabel"
    :validate="validateName"
    @close="nameDialog = null"
    @confirm="confirmName"
  />

  <ConfirmDialog
    :is-open="deleteDialogOpen"
    title="Delete preset?"
    :description="`The preset “${active?.name ?? ''}” will be permanently deleted.`"
    confirm-label="Delete"
    destructive
    @close="deleteDialogOpen = false"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.preset-trigger {
  max-width: 180px;
}
.preset-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-popover {
  width: 300px;
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
}
.delete-action {
  color: var(--color-danger);
}
.dirty-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
}
</style>
