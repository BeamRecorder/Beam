<script setup lang="ts">
import { capture } from '~/api/capture';
import TogglePreference from '~/components/settings/TogglePreference.vue';
import { useTranslate } from '~/i18n/useTranslate';

const hideTaskbar = defineModel<boolean>('hideTaskbar', { default: false });
const hideDesktopIcons = defineModel<boolean>('hideDesktopIcons', {
  default: false,
});
const { t } = useTranslate('ScreenRegionOverlay');
const supported = capture.platform === 'win32' || capture.platform === 'darwin';
</script>

<template>
  <div class="desktop-preferences">
    <TogglePreference
      v-model="hideTaskbar"
      :disabled="!supported"
      :label="t(capture.platform === 'darwin' ? 'hideDock' : 'hideTaskbar')"
      data-setting="hide-taskbar"
      tabindex="-1"
    />
    <TogglePreference
      v-model="hideDesktopIcons"
      :disabled="!supported"
      :label="t('hideDesktopIcons')"
      data-setting="hide-desktop-icons"
      tabindex="-1"
    />
    <p v-if="!supported" class="platform-note">{{ t('desktopUnavailable') }}</p>
    <p v-else-if="capture.platform === 'darwin'" class="platform-note">
      {{ t('captureOnly') }}
    </p>
  </div>
</template>

<style scoped>
.desktop-preferences {
  display: grid;
  gap: 14px;
  width: 100%;
}
.platform-note {
  margin: 0;
  color: var(--text-secondary);
  font: 400 var(--font-size-xs) / 1.5 var(--font-sans);
}
</style>
