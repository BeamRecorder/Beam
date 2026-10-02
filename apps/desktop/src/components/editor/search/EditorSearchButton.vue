<script setup lang="ts">
import { inject } from 'vue';
import { Search } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { editorSearchKey } from './editor-search-types';
const search = inject(editorSearchKey, null);
const { t } = useTranslate('EditorSearch');
const shortcut = window.capture?.platform === 'darwin' ? '⌘F' : 'Ctrl+F';
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
    :tooltip="`${t('title')} (${shortcut})`"
    @click="search.open.value = true"
  />
</template>
