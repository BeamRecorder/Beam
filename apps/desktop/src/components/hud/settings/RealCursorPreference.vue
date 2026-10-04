<script setup lang="ts">
import TogglePreference from '~/components/settings/TogglePreference.vue';
import InfoTooltip from '~/ui/tooltip/InfoTooltip.vue';
import { useTranslate } from '~/i18n/useTranslate';
const enabled = defineModel<boolean>({ default: false });
const { t } = useTranslate('CursorRecording');
</script>
<template>
  <TogglePreference
    v-model="enabled"
    :label="t('showRealCursor')"
    class="real-cursor-row"
    data-setting="show-real-cursor"
    tabindex="-1"
  >
    <template #info><InfoTooltip :content="t('description')" /></template>
  </TogglePreference>
</template>
