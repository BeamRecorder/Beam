<script setup lang="ts">
import { Library } from '@lucide/vue';
import ContextMenuDivider from '~/ui/context-menu/ContextMenuDivider.vue';
import ContextMenuItem from '~/ui/context-menu/ContextMenuItem.vue';
import { useElementAssetSaving } from './useElementAssetSaving';
const props = defineProps<{ id: string; dividerAfter?: boolean }>();
const emit = defineEmits<{ select: [] }>();
const saving = useElementAssetSaving();
const save = () => {
  saving?.request(saving.source(props.id));
  emit('select');
};
</script>
<template>
  <template v-if="saving?.supports(saving.source(id))">
    <ContextMenuItem
      :icon="Library"
      :label="saving.label()"
      :disabled="!saving.canSave(saving.source(id))"
      @click="save"
    />
    <ContextMenuDivider v-if="dividerAfter" />
  </template>
</template>
