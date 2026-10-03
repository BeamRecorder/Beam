<script setup lang="ts">
import TogglePreference from './TogglePreference.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useSpellCheckStore } from '~/stores/spell-check';

const { t } = useTranslate('HudPreferences');
const spellCheckStore = useSpellCheckStore();
</script>

<template>
  <TogglePreference
    class="spell-check-preference"
    :model-value="spellCheckStore.enabled"
    :label="t('spellCheck')"
    :description="t('spellCheckDescription')"
    @update:model-value="spellCheckStore.setEnabled"
  />
</template>
