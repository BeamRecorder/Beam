<script setup lang="ts">
import { computed } from 'vue';
import { Plus } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import PopoverMenuButton from '~/ui/popover/PopoverMenuButton.vue';
import { editorInsertMenu } from '../editor/search/editor-insert-menu';
import { editorInsertItems } from '../editor/search/editor-insert-items';
import type { EditorInsertKind } from '../editor/search/editor-search-types';
const { t } = useI18n();
defineProps<{ disabled?: boolean; direction?: 'up' | 'down' }>();
const items = computed(() => editorInsertMenu(editorInsertItems('screenshot', t), t));
const emit = defineEmits<{ add: [kind: EditorInsertKind] }>();
</script>
<template>
  <PopoverMenuButton
    :disabled="disabled"
    :label="t('TimelineToolbar.add')"
    :aria-label="t('TimelineToolbar.add')"
    :icon="Plus"
    :direction="direction"
    :items="items"
    @select="emit('add', $event as EditorInsertKind)"
  />
</template>
