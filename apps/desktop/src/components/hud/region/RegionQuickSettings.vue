<script setup lang="ts">
import { computed } from 'vue';
import { Settings, Timer } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import PopoverMenuList from '~/ui/popover/PopoverMenuList.vue';
import RealCursorPreference from '../settings/RealCursorPreference.vue';
import RecordingDesktopPreferences from '../settings/RecordingDesktopPreferences.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
const settings = defineModel<RegionRecordingSettings>({ required: true });
const { t } = useTranslate('ScreenRegionOverlay');
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
          <RealCursorPreference
            :model-value="settings.showRealCursor"
            @update:model-value="settings = { ...settings, showRealCursor: $event }"
          />
        </div>
        <div class="desktop-settings">
          <RecordingDesktopPreferences
            :hide-taskbar="settings.hideTaskbar"
            :hide-desktop-icons="settings.hideDesktopIcons"
            @update:hide-taskbar="settings = { ...settings, hideTaskbar: $event }"
            @update:hide-desktop-icons="settings = { ...settings, hideDesktopIcons: $event }"
          />
        </div>
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
.desktop-settings {
  padding: 8px 12px;
}
</style>
