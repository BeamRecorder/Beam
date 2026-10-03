<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue';
import ContextMenu from '~/ui/context-menu/ContextMenu.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import { useI18n } from 'vue-i18n';
import { editorInsertMenu } from './editor-insert-menu';
import { editorSearchKey } from './editor-search-types';
const { t } = useI18n();
const search = inject(editorSearchKey, null);
const menu = ref<InstanceType<typeof ContextMenu> | null>(null);
const surface = ref<HTMLElement | null>(null);
const error = ref('');
const actions = computed(() => search?.actions.value.filter((action) => action.group === 'insert') ?? []);
const items = computed(() => editorInsertMenu(actions.value, t));
const open = async (event: MouseEvent) => {
  if (!actions.value.length || event.button !== 0 || event.ctrlKey || event.metaKey) return;
  error.value = '';
  menu.value?.open(event);
  await nextTick();
  surface.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
};
const select = async (id: string) => {
  const action = actions.value.find((action) => action.id === id);
  if (!action || action.disabled) return;
  menu.value?.close();
  try {
    await action.run();
  } catch (reason) {
    error.value = String(reason);
  }
};
defineExpose({ open });
</script>
<template>
  <ContextMenu ref="menu" flush allow-overflow :min-width="0">
    <template #default="{ close }">
      <div ref="surface">
        <PopoverMenuList :items="items" @select="select" @dismiss="close" />
      </div>
    </template>
  </ContextMenu>
  <p v-if="error" role="alert" class="insert-error">{{ error }}</p>
</template>
<style scoped>
.insert-error {
  position: absolute;
  bottom: 16px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-element);
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
