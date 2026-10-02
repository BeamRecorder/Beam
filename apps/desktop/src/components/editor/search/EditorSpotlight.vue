<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue';
import CommandPalette from '~/ui/command-palette/CommandPalette.vue';
import EditorSearchThumbnail from './EditorSearchThumbnail.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { editorSearchKey } from './editor-search-types';
const props = defineProps<{ navigate: (tab: string) => void }>();
const context = inject(editorSearchKey)!;
const release = context.setNavigator((tab) => props.navigate(tab));
const { t } = useTranslate('EditorSearch');
const { t: dialogText } = useTranslate('Dialog');
const { t: backText } = useTranslate('TopbarHUD');
const byId = computed(() => new Map(context.actions.value.map((action) => [action.id, action])));
const keydown = (event: KeyboardEvent) => {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 'f' ||
    event.repeat ||
    !context.ready.value
  )
    return;
  if (!context.open.value && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  context.open.value = true;
};
watch(context.open, (value) => {
  if (!value) context.setVisibleActions([]);
});
onMounted(() => window.addEventListener('keydown', keydown, true));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown, true);
  context.setVisibleActions([]);
  release();
});
</script>
<template>
  <CommandPalette
    :open="context.open.value"
    :items="context.items.value"
    :title="t('title')"
    :placeholder="t('placeholder')"
    :empty-label="t('noResults')"
    :unavailable-label="t('unavailable')"
    :close-label="dialogText('close')"
    :back-label="backText('back')"
    @close="context.open.value = false"
    @reopen="context.open.value = true"
    @visible-items="context.setVisibleActions"
  >
    <template #leading="{ item }"
      ><EditorSearchThumbnail :preview="byId.get(item.id)?.preview" :icon="item.icon"
    /></template>
  </CommandPalette>
</template>
