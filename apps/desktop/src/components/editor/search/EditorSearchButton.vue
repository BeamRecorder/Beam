<script setup lang="ts">
import { computed, inject } from 'vue';
import { shortcutLabel } from '~/shortcuts/shortcut-label';
import { actionKeys } from '~/shortcuts/action-bindings';
import { Search } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { editorSearchKey } from './editor-search-types';
const search = inject(editorSearchKey, null);
const { t } = useTranslate('EditorSearch');
const shortcut = computed(() => shortcutLabel(actionKeys('editor.search')));
</script>
<template>
  <Button
    v-if="search"
    variant="ghost"
    size="sm"
    icon-only
    :disabled="!search.ready.value"
    :icon="Search"
    :aria-label="t('title')"
    :tooltip="shortcut ? `${t('title')} (${shortcut})` : t('title')"
    @click="search.open.value = true"
  />
</template>
