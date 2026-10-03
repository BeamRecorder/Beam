<script setup lang="ts">
import Select from '~/ui/select/Select.vue';
import ThemeModePicker from '../settings/ThemeModePicker.vue';
import DirectoryPreference from '../settings/DirectoryPreference.vue';
import OnboardingAccess from './OnboardingAccess.vue';
import { useThemeStore } from '~/stores/theme';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import { isSupportedLocale, localeOptions } from '~/i18n/locales';

defineProps<{ disabled: boolean }>();
const theme = useThemeStore();
const locale = useLocaleStore();
const { t } = useTranslate('Onboarding');
const changeLanguage = (value: string | number) => {
  if (typeof value === 'string' && isSupportedLocale(value)) void locale.setLocale(value);
};
</script>

<template>
  <fieldset class="preferences" :disabled="disabled">
    <div class="preference">
      <span class="label">{{ t('appearance') }}</span>
      <div class="centered-theme"><ThemeModePicker v-model="theme.theme" /></div>
    </div>
    <div class="language preference">
      <label for="onboarding-language">{{ t('language') }}</label>
      <Select
        id="onboarding-language"
        :model-value="locale.locale"
        :options="localeOptions"
        :aria-label="t('language')"
        :disabled="disabled"
        appearance="neutral"
        @update:model-value="changeLanguage"
      />
    </div>
    <DirectoryPreference kind="projects" :disabled="disabled" />
    <OnboardingAccess :disabled="disabled" />
  </fieldset>
</template>

<style scoped>
.preferences {
  display: grid;
  gap: 28px;
  min-width: 0;
  border: 0;
  padding: 0 28px 0 8px;
  margin: 0;
}
.centered-theme {
  width: min(100%, 440px);
  margin: 0 auto;
}
.preference {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.label,
.language label {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
}
.language {
  grid-template-columns: 1fr minmax(0, 240px);
  align-items: center;
}
</style>
