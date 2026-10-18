<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { Circle, Clock3, GripVertical, ScrollText, Settings, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import CaptureCameraIcon from '../CaptureCameraIcon.vue';
import AudioIconMeter from '../audio/AudioIconMeter.vue';
import { useAudioLevelMeter } from '../audio/useAudioLevelMeter';
import { useNativeSystemAudioPreview } from './useNativeSystemAudioPreview';
import { capture } from '~/api/capture';
import { listBrowserCameras } from '~/api/camera-recorder';
import { listBrowserMicrophones } from '~/api/microphone-recorder';
import { useTranslate } from '~/i18n/useTranslate';
import type { SelectOption } from '~/ui/select/select-types';
import type { RegionRecordingSettings } from '~/api/types/screen-region';
import type { CapturePreparationRequest } from './capture-preparation-types';
import PreparationDeviceSelect from './PreparationDeviceSelect.vue';

const props = defineProps<{ request: CapturePreparationRequest; busy: boolean }>();
const emit = defineEmits<{ record: []; cancel: []; 'update:settings': [settings: RegionRecordingSettings] }>();
const { t } = useTranslate('HUD');
const { t: regionT } = useTranslate('ScreenRegionOverlay');
const settings = computed(() => props.request.settings);
const cameras = ref<SelectOption[]>([]);
const microphones = ref<SelectOption[]>([]);
const cameraOptions = computed(() => [...cameras.value, { value: 'off', label: t('cameraOff') }]);
const micOptions = computed(() => [...microphones.value, { value: 'no-audio', label: t('noMicrophone') }]);
const audioOptions = computed(() => [
  { value: 'on', label: t('systemAudio') },
  { value: 'off', label: t('noSystemAudio') },
]);
const { level: micLevel } = useAudioLevelMeter(
  computed(() => !props.busy && settings.value.microphoneId !== 'no-audio'),
  computed(() => settings.value.microphoneId),
);
const { level: systemLevel } = useNativeSystemAudioPreview(
  computed(() => !props.busy && capture.platform === 'linux' && settings.value.systemAudio),
);
const error = ref('');
const bar = ref<HTMLElement | null>(null);
const fitBar = () => {
  if (props.busy || !bar.value?.offsetWidth) return;
  void capture.preparation.fitBar(bar.value.offsetWidth).catch((reason) => {
    error.value = String(reason);
  });
};
useResizeObserver(bar, fitBar);
const teleprompterVisible = ref(false);
const settingsVisible = ref(false);
let disposed = false;
const disabled = computed(() => props.busy);
const apply = (patch: Partial<RegionRecordingSettings>) => {
  if (disabled.value) return;
  emit('update:settings', { ...settings.value, ...patch });
  if (patch.cameraId !== undefined) capture.configureCameraOverlay({ cameraId: patch.cameraId });
};
const openSettings = async (event: MouseEvent) => {
  if (disabled.value) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  try {
    await capture.preparation.configure({ ...settings.value });
    await capture.preparation.toggleSettings({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  } catch (reason) {
    error.value = String(reason);
  }
};
const toggleTeleprompter = () => {
  if (disabled.value) return;
  capture.toggleTeleprompterVisibility();
};
const keydown = (event: KeyboardEvent) => {
  if (
    disabled.value ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return;
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('cancel');
  } else if (
    event.key === 'Enter' &&
    !(
      event.target instanceof Element &&
      event.target.closest('button, input, textarea, [contenteditable], [role="combobox"]')
    )
  ) {
    event.preventDefault();
    emit('record');
  }
};
const dismissOutside = (event: PointerEvent) => {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('[data-preparation-settings], [aria-haspopup="menu"]')
  )
    capture.preparation.dismiss();
};
const offVisibility = capture.onTeleprompterVisibility((visible) => {
  teleprompterVisible.value = visible;
});
const offSettings = capture.preparation.onSettingsVisibility((visible) => {
  settingsVisible.value = visible;
});
onMounted(async () => {
  fitBar();
  window.addEventListener('keydown', keydown);
  const results = await Promise.allSettled([listBrowserCameras(), listBrowserMicrophones()]);
  if (disposed) return;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      error.value = String(result.reason);
      return;
    }
    const options = result.value.map(({ id, label }) => ({ value: id, label }));
    if (index === 0) cameras.value = options;
    else microphones.value = options;
  });
});
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('keydown', keydown);
  offVisibility();
  offSettings();
});
</script>
<template>
  <aside
    ref="bar"
    class="preparation-bar"
    :class="{ opaque: capture.platform === 'linux' }"
    data-capture-preparation
    @contextmenu.prevent
    @pointerdown="dismissOutside"
  >
    <GripVertical :size="16" class="grip" aria-hidden="true" />
    <div class="control-slot">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="X"
        :disabled="disabled"
        :aria-label="regionT('cancel')"
        :title="regionT('cancel')"
        @click="emit('cancel')"
      />
    </div>
    <div class="control-slot">
      <Button
        variant="ghost"
        size="sm"
        icon-only
        :icon="ScrollText"
        :disabled="disabled"
        :aria-label="t('teleprompter')"
        :title="t('teleprompter')"
        :aria-pressed="teleprompterVisible"
        @click="toggleTeleprompter"
      />
    </div>
    <span class="divider" />
    <div class="control-slot">
      <PreparationDeviceSelect
        kind="camera"
        :value="settings.cameraId"
        :options="cameraOptions"
        :label="t('camera')"
        :disabled="disabled"
        @select="apply({ cameraId: $event })"
        @error="error = $event"
        ><CaptureCameraIcon :enabled="settings.cameraId !== 'off'"
      /></PreparationDeviceSelect>
    </div>
    <div class="control-slot">
      <PreparationDeviceSelect
        kind="microphone"
        :value="settings.microphoneId"
        :options="micOptions"
        :label="t('microphone')"
        :disabled="disabled"
        @select="apply({ microphoneId: $event })"
        @error="error = $event"
        ><AudioIconMeter kind="mic" :enabled="settings.microphoneId !== 'no-audio'" :level="micLevel"
      /></PreparationDeviceSelect>
    </div>
    <div class="control-slot">
      <PreparationDeviceSelect
        kind="systemAudio"
        :value="settings.systemAudio ? 'on' : 'off'"
        :options="audioOptions"
        :label="t('systemAudio')"
        :disabled="disabled"
        @select="apply({ systemAudio: $event === 'on' })"
        @error="error = $event"
        ><AudioIconMeter kind="system" :enabled="settings.systemAudio" :level="systemLevel"
      /></PreparationDeviceSelect>
    </div>
    <div class="control-slot">
      <Button
        data-preparation-settings
        variant="ghost"
        size="sm"
        icon-only
        :icon="Settings"
        :disabled="disabled"
        :aria-label="regionT('settings')"
        :title="regionT('settings')"
        :aria-expanded="settingsVisible"
        aria-haspopup="dialog"
        @click="openSettings"
      />
    </div>
    <div class="control-slot">
      <Button
        data-preparation-record
        variant="primary"
        size="sm"
        :icon="Circle"
        :disabled="disabled"
        @click="emit('record')"
        ><span class="record-label"
          ><span>{{ regionT('record') }}</span
          ><span class="countdown"
            ><Clock3 :size="12" aria-hidden="true" /><span>{{
              settings.countdownSeconds === 0 ? regionT('off') : `${settings.countdownSeconds}s`
            }}</span></span
          ></span
        ></Button
      >
    </div>
    <p v-if="error" role="alert" class="preparation-error">{{ error }}</p>
  </aside>
</template>
<style scoped>
.preparation-bar {
  position: absolute;
  top: 16px;
  left: 16px;
  width: max-content;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-bg-element) 82%, transparent);
  box-shadow: var(--shadow-lg);
  color: var(--text-primary);
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}
.preparation-bar.opaque {
  background: var(--color-bg-surface);
}
.grip {
  flex: none;
  color: var(--text-secondary);
}
.control-slot {
  display: flex;
  flex: none;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.divider {
  height: 24px;
  width: 1px;
  margin: 0 4px;
  background: var(--color-border);
}
.record-label {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
}
.countdown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  line-height: 1;
  font-size: var(--font-size-xs);
}
.preparation-error {
  position: absolute;
  bottom: 0;
  left: 8px;
  right: 8px;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--color-error);
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
</style>
