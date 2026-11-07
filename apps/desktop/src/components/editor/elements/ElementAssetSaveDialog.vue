<script setup lang="ts">
import { ref } from 'vue';
import { saveElementAsset } from '@beam/engine/shared/element-assets';
import { useTranslate } from '~/i18n/useTranslate';
import TextInputDialog from '~/ui/dialog/TextInputDialog.vue';
import { useToastStore } from '~/ui/toast/toastStore';
import { useElementAssets } from './useElementAssets';
import { useElementAssetSaving } from './useElementAssetSaving';
const saving = useElementAssetSaving();
const store = useElementAssets();
const toast = useToastStore();
const { t } = useTranslate('Elements');
const { t: onboarding } = useTranslate('Onboarding');
const busy = ref(false);
const confirm = async (name: string) => {
  const draft = saving?.draft.value;
  if (!draft || busy.value) return;
  busy.value = true;
  try {
    await store.add(saveElementAsset({ ...draft.clip, name }, draft.canvas));
    if (saving.draft.value === draft) saving.close();
  } catch (error) {
    toast.add(`${onboarding('saveError')}${error instanceof Error ? ` ${error.message}` : ''}`, 'error');
  } finally {
    busy.value = false;
  }
};
</script>
<template>
  <TextInputDialog
    :is-open="Boolean(saving?.draft.value)"
    :title="t('addToAssets')"
    :label="t('assetName')"
    :initial-value="saving?.draft.value?.clip.name.slice(0, 200)"
    :max-length="200"
    :busy="busy"
    @close="!busy && saving?.close()"
    @confirm="confirm"
  />
</template>
