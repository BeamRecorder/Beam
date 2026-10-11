<script setup lang="ts">
import { computed } from 'vue';
import { FolderOpen, RefreshCw } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useStorageDirectories } from './useStorageDirectories';
import type { DirectoryKind } from '~/api/types/storage-directories';

const props = defineProps<{ kind: DirectoryKind; compact?: boolean; disabled?: boolean }>();
const { t } = useTranslate('DirectoryPreferences');
const { snapshot, busy, loading, error, load, choose, select } = useStorageDirectories();
const automatic = 'automatic';
const title = computed(() => t(props.kind === 'projects' ? 'projects' : 'exports'));
const isExportDialog = computed(() => props.compact && props.kind === 'exports');
const automaticExportPath = computed(() =>
  snapshot.value ? (snapshot.value.exports.lastDirectory ?? snapshot.value.defaultExportDirectory) : '',
);
const model = computed(() => {
  const directory = snapshot.value?.[props.kind].directory;
  // A fixed export folder matching the automatic path shares its single visible row.
  return directory == null || (props.kind === 'exports' && directory === automaticExportPath.value)
    ? automatic
    : directory;
});
const options = computed(() => {
  const recent = snapshot.value?.[props.kind].recent ?? [];
  if (props.kind === 'exports' && recent.length === 0) return [];
  const paths = recent.filter((directory) => props.kind === 'projects' || directory !== automaticExportPath.value);
  return [
    props.kind === 'projects'
      ? { value: automatic, label: t('defaultLocation') }
      : { value: automatic, label: automaticExportPath.value, description: t('lastUsed') },
    ...paths.map((directory) => ({ value: directory, label: directory })),
  ];
});
const effectivePath = computed(() => {
  const current = snapshot.value;
  if (!current) return '';
  return props.kind === 'projects'
    ? (current.projects.directory ?? current.defaultProjectsDirectory)
    : (current.exports.directory ?? current.exports.lastDirectory ?? current.defaultExportDirectory);
});
const update = (value: string | number) => {
  if (typeof value === 'string') void select(props.kind, value === automatic ? null : value);
};
</script>

<template>
  <div class="directory-preference" :data-setting="`${kind}-directory`" tabindex="-1" :aria-busy="busy">
    <span class="directory-title">{{ title }}</span>
    <p v-if="!compact" class="directory-description">
      {{ t(kind === 'projects' ? 'projectsDescription' : 'exportsDescription') }}
    </p>
    <div class="directory-controls">
      <Select
        :model-value="model"
        :options="options"
        :placeholder="effectivePath || t('browse')"
        :empty-label="t('emptyFolders')"
        :disabled="busy || disabled || !snapshot"
        :loading="loading"
        :aria-label="title"
        :search-placeholder="t('search')"
        :no-results-label="t('noMatches')"
        :variant="options.length ? 'search' : 'default'"
        appearance="neutral"
        :size="isExportDialog ? 'md' : 'sm'"
        @update:model-value="update"
      />
      <Button
        variant="secondary"
        :size="isExportDialog ? 'md' : 'sm'"
        icon-only
        :icon="FolderOpen"
        :disabled="busy || disabled || !snapshot"
        :aria-label="t('browse')"
        :tooltip="t('browse')"
        @click="choose(kind)"
      />
    </div>
    <p v-if="kind === 'projects' && effectivePath" class="directory-path" :title="effectivePath">{{ effectivePath }}</p>
    <div v-if="error" class="directory-error" role="alert">
      <span>{{ t('error') }} {{ error }}</span>
      <Button v-if="!snapshot" variant="ghost" size="sm" :icon="RefreshCw" :disabled="busy" @click="load">{{
        t('retry')
      }}</Button>
    </div>
  </div>
</template>

<style scoped>
.directory-preference {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.directory-title {
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
}
.directory-description,
.directory-path {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}
.directory-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.directory-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.directory-error {
  display: grid;
  gap: 8px;
  color: var(--color-error);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}
</style>
