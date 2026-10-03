<script setup lang="ts">
import { ref } from 'vue';
import { Settings } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Popover from '~/ui/popover/Popover.vue';
import CaptureQuickSettingsPanel from './CaptureQuickSettingsPanel.vue';
import { useTranslate } from '~/i18n/useTranslate';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
const settings = defineModel<RegionRecordingSettings>({ required: true });
const popover = ref<InstanceType<typeof Popover> | null>(null);
const { t } = useTranslate('ScreenRegionOverlay');
</script>
<template>
  <Popover ref="popover" direction="up" :match-trigger-width="false">
    <template #trigger="{ isOpen }">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="Settings"
        :aria-label="t('settings')"
        :title="t('settings')"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
      />
    </template>
    <CaptureQuickSettingsPanel v-model="settings" @dismiss="popover?.close()" />
  </Popover>
</template>
