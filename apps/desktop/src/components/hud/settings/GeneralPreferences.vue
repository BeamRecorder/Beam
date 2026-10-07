<script setup lang="ts">
import { Sparkles } from '@lucide/vue';
import { ref } from 'vue';
import { usePreferencesStore } from '~/stores/preferences';
import { useLocaleStore } from '~/stores/locale';
import { useTranslate } from '~/i18n/useTranslate';
import { isSupportedLocale, localeOptions } from '~/i18n/locales';
import { capture } from '~/api/capture';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import AppearanceSettings from '~/components/settings/AppearanceSettings.vue';
import TogglePreference from '~/components/settings/TogglePreference.vue';
import { useExportBackendPreference } from '~/components/export/useExportBackendPreference';

defineProps<{ focusedSetting?: string }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useTranslate('HudPreferences');
const { t: exportText } = useTranslate('ExportPopover');
const exportBackend = useExportBackendPreference();
const localeStore = useLocaleStore();
const preferences = usePreferencesStore();
const startupBusy = ref(false);
const startupError = ref('');
const closeBusy = ref(false);
const closeError = ref('');
const setMinimizeToTray = async (enabled: boolean) => {
  if (closeBusy.value || !preferences.settings) return;
  closeBusy.value = true;
  closeError.value = '';
  try {
    await preferences.update({ minimizeToTray: enabled });
  } catch (error) {
    closeError.value = String(error);
  } finally {
    closeBusy.value = false;
  }
};
const setLaunchAtStartup = async (enabled: boolean) => {
  if (!capture.canLaunchAtStartup || startupBusy.value || !preferences.settings) return;
  startupBusy.value = true;
  startupError.value = '';
  try {
    await preferences.update({ launchAtStartup: enabled });
  } catch (error) {
    startupError.value = String(error);
  } finally {
    startupBusy.value = false;
  }
};
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
    <div class="preference-item preview-preference" data-setting="launch-at-startup" tabindex="-1">
      <TogglePreference
        :model-value="preferences.settings?.launchAtStartup ?? true"
        :disabled="!capture.canLaunchAtStartup || !preferences.settings"
        :busy="startupBusy"
        :label="t('launchAtStartup')"
        :description="t(capture.canLaunchAtStartup ? 'launchAtStartupDescription' : 'launchAtStartupInstalled')"
        @update:model-value="setLaunchAtStartup"
      />
      <p v-if="startupError" class="preference-error" role="alert">{{ startupError }}</p>
    </div>
    <div class="preference-item preview-preference" data-setting="minimize-to-tray" tabindex="-1">
      <TogglePreference
        :model-value="preferences.settings?.minimizeToTray ?? false"
        :disabled="!preferences.settings"
        :busy="closeBusy"
        :label="t('minimizeToTray')"
        :description="t('minimizeToTrayDescription')"
        @update:model-value="setMinimizeToTray"
      />
      <p v-if="closeError" class="preference-error" role="alert">{{ closeError }}</p>
    </div>
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
    <div
      v-if="exportBackend.available"
      class="preference-item preview-preference"
      data-setting="video-export-backend"
      tabindex="-1"
    >
      <TogglePreference
        :model-value="exportBackend.enabled.value"
        :disabled="!exportBackend.ready.value"
        :busy="exportBackend.busy.value"
        :label="exportText('experimentalFfmpeg')"
        :description="exportText('experimentalFfmpegDesc')"
        @update:model-value="exportBackend.setEnabled"
      />
      <p v-if="exportBackend.error.value" class="preference-error" role="alert">{{ exportBackend.error.value }}</p>
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
<style scoped>
.preference-error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
</style>
