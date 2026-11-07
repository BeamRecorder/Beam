<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { Trash2 } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useElementEditor } from './useElementEditor';
import ContextMenuItem from '~/ui/context-menu/ContextMenuItem.vue';
import ContextMenu from '~/ui/context-menu/ContextMenu.vue';
import ElementAssetMenuItem from './ElementAssetMenuItem.vue';
import { useElementAssetSaving } from './useElementAssetSaving';
const props = defineProps<{ idAt: (event: MouseEvent) => string | null; disabled?: boolean }>();
const saving = useElementAssetSaving();
const editor = useElementEditor();
const { t } = useTranslate('Elements');
const menu = ref<InstanceType<typeof ContextMenu> | null>(null);
const id = shallowRef<string | null>(null);
const canRemove = computed(() => {
  const clip = saving?.source(id.value ?? '');
  return Boolean(!props.disabled && editor?.canInteract.value && clip && !clip.locked);
});
const remove = () => {
  if (!canRemove.value || !id.value) return;
  editor?.remove(id.value);
  menu.value?.close();
};
const open = (event: MouseEvent) => {
  if (
    props.disabled ||
    event.defaultPrevented ||
    (event.target instanceof Element && event.target.closest('button, input, textarea, [role="menu"], [role="dialog"]'))
  )
    return;
  const hit = saving?.source(props.idAt(event) ?? '');
  if (!saving?.supports(hit)) return;
  event.preventDefault();
  event.stopPropagation();
  id.value = hit.id;
  menu.value?.open(event);
};
defineExpose({ open });
</script>
<template>
  <ContextMenu ref="menu">
    <template #default="{ close }">
      <ElementAssetMenuItem v-if="id" :id="id" divider-after @select="close" />
      <ContextMenuItem :icon="Trash2" :label="t('delete')" danger :disabled="!canRemove" @click="remove" />
    </template>
  </ContextMenu>
</template>
