<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { capture } from '~/api/capture';
import CaptureQuickSettingsPanel from '../hud/region/CaptureQuickSettingsPanel.vue';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { SelectOption } from '~/ui/select/select-types';
import { useTranslate } from '~/i18n/useTranslate';
import QuickSnipDeviceChoices from './QuickSnipDeviceChoices.vue';
import type { QuickSnipSettingsContent } from '~/api/types/quick-snip-settings';
import { popoverAnchorConstraintKey } from '~/ui/popover/popover-viewport-types';
provide(popoverAnchorConstraintKey, true);
const { t } = useTranslate('QuickSnipCropBar');
const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');
const configuration = shallowRef<QuickSnipConfiguration | null>(null);
const content = shallowRef<QuickSnipSettingsContent>({ side: 'above', anchorX: 248, device: null, visible: false });
const offContent = preview
  ? () => {}
  : capture.onQuickSnipSettingsContent((next) => {
      content.value = next;
      void nextTick(fitContent);
    });
const presets = ref<SelectOption[]>(
  preview ? Array.from({ length: 10 }, (_, index) => ({ value: `demo-${index}`, label: `Preset ${index + 1}` })) : [],
);
const settings = ref<RegionRecordingSettings>({
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
  zoomMode: '2d',
});
const presetId = ref(preview ? 'demo-0' : 'default');
const busy = ref(false);
const error = ref('');
const panel = ref<HTMLElement | null>(null);
const fitContent = () => {
  const element = panel.value;
  if (!preview && element?.offsetHeight)
    capture.fitQuickSnipSettings(Math.ceil(element.scrollHeight + element.offsetHeight - element.clientHeight));
};
useResizeObserver(panel, fitContent);
let generation = 0;
const kind = computed(() => (configuration.value?.mode === 'screenshot' ? 'screenshot' : 'video'));
const off = capture.onQuickSnipConfigure((next) => {
  configuration.value = next;
  settings.value = {
    cameraId: String(next.devices.cameraId ?? 'off'),
    microphoneId: String(next.devices.micId ?? 'no-audio'),
    systemAudio: next.devices.systemAudioMode === 'on',
    countdownSeconds: next.countdownSeconds ?? 3,
    hideTaskbar: next.hideTaskbar === true,
    hideDesktopIcons: next.hideDesktopIcons === true,
    showRealCursor: next.showRealCursor === true,
    zoomMode: next.zoomMode ?? '2d',
  };
  presetId.value = next.preset.id;
  void nextTick(fitContent);
  const current = ++generation;
  void capture
    .getEditorPresets(kind.value)
    .then((document) => {
      if (current === generation)
        presets.value = document.presets.map((preset) => ({
          value: preset.id,
          label: preset.id === 'default' ? t('defaultPreset') : preset.name,
        }));
    })
    .catch((reason) => {
      if (current === generation) error.value = String(reason);
    });
});
const update = async (next: RegionRecordingSettings) => {
  settings.value = next;
  if (preview) return;
  try {
    await capture.configureQuickSnip({
      countdownSeconds: next.countdownSeconds,
      zoomMode: next.zoomMode,
      hideTaskbar: next.hideTaskbar,
      hideDesktopIcons: next.hideDesktopIcons,
      showRealCursor: next.showRealCursor,
    });
    error.value = '';
  } catch (reason) {
    error.value = String(reason);
  }
};
const selectPreset = async (id: string) => {
  if (preview) {
    presetId.value = id;
    return;
  }
  busy.value = true;
  try {
    await capture.selectEditorPreset(id, kind.value);
    await capture.configureQuickSnip({});
    error.value = '';
  } catch (reason) {
    error.value = String(reason);
  } finally {
    busy.value = false;
  }
};
onMounted(() => {
  fitContent();
  capture.notifyQuickSnipSettingsReady();
});
onBeforeUnmount(() => {
  generation++;
  off();
  offContent();
});
</script>
<template>
  <div
    class="settings-shell"
    :class="[content.side, { preview, presented: preview || content.visible }]"
    :style="{ '--anchor-x': `${content.anchorX}px` }"
    @contextmenu.prevent
  >
    <main
      ref="panel"
      class="quick-settings-window"
      :aria-label="t('settings')"
      :role="content.device ? undefined : 'dialog'"
    >
      <QuickSnipDeviceChoices
        v-if="content.device"
        :menu="content.device"
        @select="capture.selectQuickSnipDevice"
        @dismiss="capture.dismissQuickSnipSettings"
      />
      <CaptureQuickSettingsPanel
        v-else
        :model-value="settings"
        show-preset
        :screenshot="kind === 'screenshot'"
        :presets="presets"
        :preset-id="presetId"
        :disabled="busy"
        @update:model-value="update"
        @preset="selectPreset"
        @dismiss="if (!preview) capture.dismissQuickSnipSettings();"
      />
      <p v-if="error" role="alert">{{ error }}</p>
    </main>
  </div>
</template>
<style scoped>
.settings-shell {
  box-sizing: border-box;
  padding: 10px 10px 16px;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.12);
  transform-origin: var(--anchor-x) bottom;
  transition:
    transform 150ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 100ms ease;
}
.settings-shell.presented {
  opacity: 1;
  transform: scale(1);
}
.settings-shell.below {
  padding: 16px 10px 10px;
  transform-origin: var(--anchor-x) top;
}
.settings-shell.preview {
  padding: 0;
}
.settings-shell:not(.preview)::after {
  content: '';
  position: absolute;
  left: calc(var(--anchor-x) - 5px);
  width: 10px;
  height: 10px;
  background: var(--color-bg-element);
  border-right: 1px solid var(--color-border-strong);
  border-bottom: 1px solid var(--color-border-strong);
  bottom: 11px;
  transform: rotate(45deg);
  pointer-events: none;
}
.settings-shell.below::after {
  top: 11px;
  bottom: auto;
  transform: rotate(225deg);
}
.quick-settings-window {
  width: 100%;
  background: var(--color-bg-element);
  color: var(--text-primary);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  max-height: calc(100vh - 26px);
  overflow-y: auto;
  overflow-x: hidden;
  box-shadow: var(--shadow-sm);
}
.preview .quick-settings-window {
  max-height: 100vh;
}
@media (prefers-reduced-motion: reduce) {
  .settings-shell {
    transition: none;
  }
}
p {
  margin: 0;
  padding: 8px 12px;
  color: var(--color-error);
  font-size: var(--font-size-xs);
}
</style>
