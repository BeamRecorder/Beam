<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue';
import { capture } from '~/api/capture';
import { useTranslate } from '~/i18n/useTranslate';
import { popoverAnchorConstraintKey } from '~/ui/popover/popover-viewport-types';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { QuickSnipSettingsContent } from '~/api/types/quick-snip-settings';
import CaptureSettingsWindow from '../region/CaptureSettingsWindow.vue';
import CaptureQuickSettingsPanel from '../region/CaptureQuickSettingsPanel.vue';
import QuickSnipDeviceChoices from '../../quick-snip/QuickSnipDeviceChoices.vue';
provide(popoverAnchorConstraintKey, true);
const { t } = useTranslate('ScreenRegionOverlay');
const api = capture.preparation;
const settings = shallowRef<RegionRecordingSettings | null>(null);
const content = shallowRef<QuickSnipSettingsContent>({ side: 'above', anchorX: 248, device: null, visible: false });
const panel = ref<InstanceType<typeof CaptureSettingsWindow> | null>(null);
const error = ref('');
const fit = () => void nextTick(() => panel.value?.fit());
const offSettings = api.onConfigure((next) => {
  settings.value = next;
  fit();
});
const offContent = api.onContent((next) => {
  content.value = next;
  fit();
});
const update = async (next: RegionRecordingSettings) => {
  try {
    await api.update(next);
    settings.value = next;
    error.value = '';
  } catch (reason) {
    error.value = String(reason);
  }
};
onMounted(api.ready);
onBeforeUnmount(() => {
  offSettings();
  offContent();
});
</script>
<template>
  <CaptureSettingsWindow ref="panel" :content="content" :label="t('settings')" @fit="api.fit">
    <QuickSnipDeviceChoices
      v-if="content.device"
      :menu="content.device"
      @select="api.selectDevice"
      @dismiss="api.dismiss"
    />
    <CaptureQuickSettingsPanel
      v-else-if="settings"
      :model-value="settings"
      @update:model-value="update"
      @dismiss="api.dismiss"
    />
    <p v-if="error" role="alert">{{ error }}</p>
  </CaptureSettingsWindow>
</template>
<style scoped>
p {
  margin: 0;
  padding: 8px 12px;
  color: var(--color-error);
  font-size: var(--font-size-xs);
}
</style>
