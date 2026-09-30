<script setup lang="ts">
import { computed } from 'vue';
import { Settings, Timer } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import Switch from '~/ui/switch/Switch.vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
const settings = defineModel<RegionRecordingSettings>({ required: true });
const { t } = useTranslate('ScreenRegionOverlay');
const supported = capture.platform === 'win32' || capture.platform === 'darwin';
const items = computed(() => [
  {
    id: 'countdown',
    label: `${t('countdown')} · ${settings.value.countdownSeconds ? `${settings.value.countdownSeconds}s` : t('off')}`,
    icon: Timer,
    children: Array.from({ length: 11 }, (_, seconds) => ({
      id: String(seconds),
      label: seconds === 0 ? t('off') : `${seconds}s`,
      active: seconds === settings.value.countdownSeconds,
    })),
  },
]);
</script>
<template>
  <Popover direction="up" :match-trigger-width="false" allow-overflow>
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="sm"
        :icon="Settings"
        :aria-label="t('settings')"
        :title="t('settings')"
        :aria-expanded="isOpen"
        aria-haspopup="menu"
      />
    </template>
    <template #default="{ close }">
      <div class="region-settings" @pointerdown.stop>
        <PopoverMenuList
          :items="items"
          @select="
            settings = { ...settings, countdownSeconds: Number($event) };
            close();
          "
          @dismiss="close"
        />
        <div class="switch-row">
          <span>{{ t(capture.platform === 'darwin' ? 'hideDock' : 'hideTaskbar') }}</span>
          <Switch
            :model-value="settings.hideTaskbar"
            :disabled="!supported"
            :aria-label="t(capture.platform === 'darwin' ? 'hideDock' : 'hideTaskbar')"
            @update:model-value="settings = { ...settings, hideTaskbar: $event }"
          />
        </div>
        <div class="switch-row">
          <span>{{ t('hideDesktopIcons') }}</span>
          <Switch
            :model-value="settings.hideDesktopIcons"
            :disabled="!supported"
            :aria-label="t('hideDesktopIcons')"
            @update:model-value="settings = { ...settings, hideDesktopIcons: $event }"
          />
        </div>
        <p v-if="!supported" class="platform-note">{{ t('desktopUnavailable') }}</p>
        <p v-else-if="capture.platform === 'darwin'" class="platform-note">{{ t('captureOnly') }}</p>
      </div>
    </template>
  </Popover>
</template>
<style scoped>
.region-settings {
  width: 264px;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  font: 500 13px var(--font-sans);
}
.platform-note {
  margin: 4px 12px 8px;
  color: var(--text-muted);
  font: 400 11px var(--font-sans);
}
</style>
