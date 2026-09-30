<script setup lang="ts">
import { Sparkles } from '@lucide/vue';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import { isSupportedLocale, localeOptions } from '~/i18n/locales';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import AppearanceSettings from '~/components/settings/AppearanceSettings.vue';

defineProps<{ focusedSetting?: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useTranslate('HudPreferences');
const localeStore = useLocaleStore();
const updateLocale = (value: string | number) => {
  if (typeof value === 'string' && isSupportedLocale(value)) localeStore.setLocale(value);
};
const openOnboarding = () => {
  void capture.openOnboarding();
  emit('close');
};
</script>

<template>
  <div class="preference-stack">
    <div class="preference-item" data-setting="language" tabindex="-1">
      <div class="preference-copy">
        <p class="preference-title">{{ t('language') }}</p>
        <p class="preference-description">{{ t('chooseLanguage') }}</p>
      </div>
      <div class="language-select preference-control">
        <Select
          :model-value="localeStore.locale"
          :options="localeOptions"
          size="sm"
          :aria-label="t('language')"
          @update:model-value="updateLocale"
        />
      </div>
    </div>
    <div class="preference-item preference-appearance-item">
      <AppearanceSettings :show-title="false" compact :show-ui-scaling="false" :focused-setting="focusedSetting" />
    </div>
    <div class="preference-item" data-setting="onboarding" tabindex="-1">
      <div class="preference-copy">
        <p class="preference-title">{{ t('onboarding') }}</p>
        <p class="preference-description">{{ t('onboardingDesc') }}</p>
      </div>
      <Button variant="secondary" size="sm" :icon="Sparkles" @click="openOnboarding">{{
        t('relaunchOnboarding')
      }}</Button>
    </div>
  </div>
</template>

<style scoped src="./settings-content.css"></style>
