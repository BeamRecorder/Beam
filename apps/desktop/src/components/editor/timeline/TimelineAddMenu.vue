<script setup lang="ts">
import { computed, inject, onBeforeUnmount } from 'vue';
import { Plus, Mic2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { editorSearchKey } from '../search/editor-search-types';
import { editorInsertMenu } from '../search/editor-insert-menu';
import { editorInsertItems } from '../search/editor-insert-items';
import PopoverMenuButton, { type PopoverMenuItem } from '~/ui/popover/PopoverMenuButton.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { TimelineElementKind } from './timeline-element-types';

const emit = defineEmits<{
  (event: 'add:element', kind: TimelineElementKind): void;
}>();
const { t } = useTranslate('TimelineToolbar');
const { t: translate } = useI18n();
const search = inject(editorSearchKey, null);
const release = search?.registerActions(() => [
  {
    id: 'insert:voiceover',
    label: t('voiceover'),
    group: 'insert',
    icon: Mic2,
    terms: ['voiceover', 'record voice'],
    run: () => emit('add:element', 'voiceover'),
  },
]);
onBeforeUnmount(() => release?.());
const items = computed<readonly PopoverMenuItem[]>(() =>
  editorInsertMenu(editorInsertItems('video', translate), translate),
);
</script>

<template>
  <PopoverMenuButton
    bare
    block
    direction="up"
    :label="t('add')"
    :aria-label="t('add')"
    :icon="Plus"
    :items="items"
    @select="emit('add:element', $event as TimelineElementKind)"
  />
</template>
