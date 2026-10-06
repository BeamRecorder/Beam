<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, CameraOff, Circle, ScrollText, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import AudioIconMeter from '../audio/AudioIconMeter.vue';
import { useAudioLevelMeter } from '../audio/useAudioLevelMeter';
import { useNativeSystemAudioPreview } from '../recorder/useNativeSystemAudioPreview';
import RegionQuickSettings from './RegionQuickSettings.vue';
import { capture } from '~/api/capture';
import { listBrowserCameras } from '~/api/camera-recorder';
import { listBrowserMicrophones } from '~/api/microphone-recorder';
import { useTranslate } from '~/i18n/useTranslate';
import type { RegionRecordingSettings, ScreenRegionOverlayOptions } from '~/api/types/screen-region';
import type { SelectOption } from '~/ui/select/select-types';
const settings = defineModel<RegionRecordingSettings>({ required: true });
const props = defineProps<{
  disabled: boolean;
  regionOptions: ScreenRegionOverlayOptions;
}>();
const emit = defineEmits<{
  cancel: [];
  record: [];
  resize: [width: number, height: number];
}>();
const { t } = useTranslate('HUD');
const { t: regionT } = useTranslate('ScreenRegionOverlay');
const cameras = ref<SelectOption[]>([]);
const microphones = ref<SelectOption[]>([]);
const cameraOptions = computed(() => [...cameras.value, { value: 'off', label: t('cameraOff') }]);
const micOptions = computed(() => [...microphones.value, { value: 'no-audio', label: t('noAudio') }]);
const audioOptions = computed(() => [
  { value: 'on', label: t('systemAudio') },
  { value: 'off', label: t('off') },
]);
const { level: micLevel } = useAudioLevelMeter(
  computed(() => settings.value.microphoneId !== 'no-audio'),
  computed(() => settings.value.microphoneId),
);
const { level: systemAudioLevel } = useNativeSystemAudioPreview(
  computed(() => capture.platform === 'linux' && settings.value.systemAudio),
);
const visible = ref(false);
const error = ref('');
const toolbar = ref<HTMLElement | null>(null);
let disposed = false;
let observer: ResizeObserver | null = null;
let unsubscribe: (() => void) | null = null;
const toggleTeleprompter = async () => {
  try {
    await capture.toggleRegionTeleprompter({
      bounds: { ...props.regionOptions.bounds },
      region: props.regionOptions.region ? { ...props.regionOptions.region } : null,
    });
  } catch (reason) {
    error.value = String(reason);
  }
};
const setCamera = (id: string | number) => {
  settings.value = { ...settings.value, cameraId: String(id) };
  capture.configureCameraOverlay({ cameraId: String(id) });
};
const measureToolbar = () => {
  if (!toolbar.value) return;
  const { offsetWidth: width, offsetHeight: height } = toolbar.value;
  // v-show reports zero while drawing. Keep the last visible size so the
  // controls return at their final position before the spring starts.
  if (width > 0 && height > 0) emit('resize', width, height);
};
onMounted(async () => {
  unsubscribe = capture.onTeleprompterVisibility((value) => {
    visible.value = value;
  });
  measureToolbar();
  observer = new ResizeObserver(measureToolbar);
  if (toolbar.value) observer.observe(toolbar.value);
  const results = await Promise.allSettled([listBrowserCameras(), listBrowserMicrophones()]);
  if (disposed) return;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      error.value = String(result.reason);
      return;
    }
    const devices = result.value.map((source) => ({
      value: source.id,
      label: source.label,
    }));
    if (index === 0) cameras.value = devices;
    else microphones.value = devices;
  });
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  unsubscribe?.();
});
</script>
<template>
  <aside ref="toolbar" class="region-recording-toolbar" @pointerdown.stop>
    <Button
      variant="ghost"
      size="sm"
      :icon="X"
      :aria-label="regionT('cancel')"
      :title="regionT('cancel')"
      @click="emit('cancel')"
    />
    <Button
      variant="ghost"
      size="sm"
      :icon="ScrollText"
      :aria-label="t('teleprompter')"
      :title="t('teleprompter')"
      :aria-pressed="visible"
      @click="toggleTeleprompter"
    />
    <span class="divider" />
    <div class="device-field">
      <Select
        size="compact"
        :option-height="28"
        :model-value="settings.cameraId"
        :options="cameraOptions"
        :label="t('camera')"
        tooltip-disabled
        @update:model-value="setCamera"
        ><template #icon><component :is="settings.cameraId === 'off' ? CameraOff : Camera" :size="14" /></template
      ></Select>
    </div>
    <div class="device-field">
      <Select
        size="compact"
        :option-height="28"
        :model-value="settings.microphoneId"
        :options="micOptions"
        :label="t('microphone')"
        tooltip-disabled
        @update:model-value="settings = { ...settings, microphoneId: String($event) }"
        ><template #icon
          ><AudioIconMeter kind="mic" :enabled="settings.microphoneId !== 'no-audio'" :level="micLevel" /></template
      ></Select>
    </div>
    <div class="device-field">
      <Select
        size="compact"
        :option-height="28"
        :model-value="settings.systemAudio ? 'on' : 'off'"
        :options="audioOptions"
        :label="t('systemAudio')"
        tooltip-disabled
        @update:model-value="settings = { ...settings, systemAudio: $event === 'on' }"
        ><template #icon
          ><AudioIconMeter kind="system" :enabled="settings.systemAudio" :level="systemAudioLevel" /></template
      ></Select>
    </div>
    <RegionQuickSettings v-model="settings" />
    <Button data-region-start variant="primary" size="sm" :icon="Circle" :disabled="disabled" @click="emit('record')">{{
      regionT('record')
    }}</Button>
    <p v-if="error" class="device-error" role="alert">{{ error }}</p>
  </aside>
</template>
<style scoped>
.region-recording-toolbar {
  position: fixed;
  z-index: 20;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  width: max-content;
  max-width: calc(100vw - 32px);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  color: var(--text-primary);
}
.divider {
  height: 24px;
  width: 1px;
  margin: 0 4px;
  background: var(--color-border);
}
.device-field {
  width: 132px;
}
.device-error {
  flex-basis: 100%;
  max-width: 640px;
  margin: 0;
  font: 400 12px var(--font-sans);
  color: var(--color-error);
}
</style>
