<script setup lang="ts">
import { Accessibility, Check, Code, Copy, Globe, Info, Palette, RefreshCw } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import SettingsSection from '~/components/settings/SettingsSection.vue';
import AppearanceSettings from '~/components/settings/AppearanceSettings.vue';
import SpellCheckPreference from '~/components/settings/SpellCheckPreference.vue';
import UpdateControls from '~/components/updates/UpdateControls.vue';
import SocialLinks from '~/components/socials/SocialLinks.vue';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import { isSupportedLocale, localeOptions } from '~/i18n/locales';
import { useCopySystemInformation } from '~/composables/useCopySystemInformation';
import EditorAccessibilitySettings from './EditorAccessibilitySettings.vue';
import EditorDeveloperSettings from './EditorDeveloperSettings.vue';

defineProps<{ hideRecorder?: boolean }>();
const { t } = useTranslate('SettingsPanel');
const { t: category } = useTranslate('HudPreferences');
const { t: appearance } = useTranslate('AppearanceSettings');
const localeStore = useLocaleStore();
const updateLocale = (value: string | number) => {
  if (typeof value === 'string' && isSupportedLocale(value)) localeStore.setLocale(value);
};
const { copied: isCopiedSysInfo, copy: copySystemInfo } = useCopySystemInformation();
</script>

<template>
  <div class="editor-settings">
    <SettingsSection :title="category('categoryGeneral')" :icon="Globe" class="general-setting">
      <div class="language-setting setting-option">
        <label class="option-label" for="editor-language">{{ t('language') }}</label>
        <Select
          id="editor-language"
          :model-value="localeStore.locale"
          :options="localeOptions"
          direction="up"
          :aria-label="t('language')"
          @update:model-value="updateLocale"
        />
      </div>
    </SettingsSection>
    <SettingsSection :title="appearance('title')" :icon="Palette" class="appearance-setting">
      <AppearanceSettings :show-title="false" compact />
    </SettingsSection>
    <SettingsSection :title="category('categoryAccessibility')" :icon="Accessibility" class="accessibility-setting">
      <SpellCheckPreference />
      <EditorAccessibilitySettings v-if="!hideRecorder" :show-title="false" />
    </SettingsSection>
    <SettingsSection :title="category('categoryUpdates')" :icon="RefreshCw" class="updates-setting">
      <UpdateControls compact />
    </SettingsSection>
    <SettingsSection :title="category('categoryAbout')" :icon="Info" class="about-setting">
      <SocialLinks compact />
      <div class="system-info-row">
        <span>{{ t('sysInfoTool') }}</span>
        <Button
          variant="ghost"
          size="sm"
          icon-only
          :icon="isCopiedSysInfo ? Check : Copy"
          class="system-info-button"
          :aria-label="isCopiedSysInfo ? t('copied') : t('copySysInfo')"
          :tooltip="isCopiedSysInfo ? t('copied') : t('copySysInfo')"
          @click="copySystemInfo"
        />
      </div>
    </SettingsSection>
    <SettingsSection :title="category('categoryDeveloper')" :icon="Code" class="developer-setting">
      <EditorDeveloperSettings :hide-recorder="hideRecorder" />
    </SettingsSection>
  </div>
</template>

<style scoped>
.editor-settings {
  display: grid;
  gap: 26px;
}
.setting-option {
  display: grid;
  gap: 8px;
}
.option-label {
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: var(--weight-title);
}
.option-description {
  margin: -3px 0 2px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}
.system-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-body);
}
</style>
