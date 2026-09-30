<script setup lang="ts">
import { computed } from 'vue';
import { useTranslate } from '~/i18n/useTranslate';
import InteractionAccessControl from '../interactions/InteractionAccessControl.vue';
import InteractionAccessError from '../interactions/InteractionAccessError.vue';
import SpellCheckPreference from '~/components/settings/SpellCheckPreference.vue';
import type { InteractionAccessViewState } from '../interactions/interaction-access-types';

const props = defineProps<{
  inputAccess: InteractionAccessViewState;
  recordInteractions: boolean;
  requestingInputAccess: boolean;
  platform: string;
}>();
const emit = defineEmits<{ 'update:recordInteractions': [boolean]; requestInputAccess: [] }>();
const { t } = useTranslate('HudPreferences');
const { t: tHud } = useTranslate('HUD');
const inputDescription = computed(() => {
  if (props.inputAccess.state === 'unavailable') return t('interactionAccessUnavailableDescription');
  if (props.inputAccess.state === 'available')
    return t(props.platform === 'linux' ? 'recordInteractionsDescriptionLinux' : 'recordInteractionsDescription');
  return t(props.platform === 'linux' ? 'interactionAccessDescriptionLinux' : 'interactionAccessDescription');
});
const interactionTitle = computed(() =>
  t(props.platform === 'linux' ? 'recordInteractionsLinux' : 'recordInteractions'),
);
</script>

<template>
  <div class="preference-stack">
    <div class="preference-item input-access-item" data-setting="interactions" tabindex="-1">
      <div class="preference-copy">
        <p class="preference-title">{{ interactionTitle }}</p>
        <p class="preference-description">{{ inputDescription }}</p>
        <InteractionAccessError :status="inputAccess" />
      </div>
      <div class="input-access-actions" role="status" aria-live="polite">
        <InteractionAccessControl
          :status="inputAccess"
          :enabled="recordInteractions"
          :requesting="requestingInputAccess"
          :enable-label="tHud('authorizeInteractions')"
          :enabling-label="tHud('authorizingInteractions')"
          :checking-label="t('checkingAccess')"
          :unavailable-label="t('accessUnavailable')"
          @request="emit('requestInputAccess')"
          @update:enabled="emit('update:recordInteractions', $event)"
        />
      </div>
    </div>
    <div class="preference-item" data-setting="spell-check" tabindex="-1"><SpellCheckPreference /></div>
  </div>
</template>

<style scoped src="./settings-content.css"></style>
