<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { useElementAssetSaving } from './useElementAssetSaving';
const saving = useElementAssetSaving();
const ElementAssetSaveDialog = defineAsyncComponent(() => import('./ElementAssetSaveDialog.vue'));
</script>
<template>
  <ElementAssetSaveDialog v-if="saving?.draft.value" />
</template>
