<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  Camera,
  CameraOff,
  ChevronDown,
  FileVideo,
  GripVertical,
  MicOff,
  Play,
  Slash,
  SlidersHorizontal,
  Square,
  Video,
  VolumeOff,
  WandSparkles,
  X,
  ZoomIn,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Divider from '~/ui/divider/Divider.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { usePreferencesStore } from '~/stores/preferences';
import { capture } from '~/api/capture';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import { useRecordingController } from '~/components/hud/recorder/useRecordingController';
import { useNativeSystemAudioPreview } from '~/components/hud/recorder/useNativeSystemAudioPreview';
import { useAudioLevelMeter } from '~/components/hud/audio/useAudioLevelMeter';
import AudioIconMeter from '~/components/hud/audio/AudioIconMeter.vue';

const { t } = useTranslate('QuickSnipCropBar');
const preferences = usePreferencesStore();
const visibility = computed(() => preferences.settings?.recordingBar.visibility ?? 'always');
const pointerOver = ref(false);
const selectionActive = ref(false);

const openSelect = (event: MouseEvent) => {
  const select = (event.currentTarget as HTMLElement).querySelector('select')!;
  if (select.disabled || (event.target as Element).closest('select')) return;
  event.preventDefault();
  select.focus();
  select.showPicker();
};

// IPC configurations are immutable snapshots; deep Vue proxies cannot cross Electron's clone boundary.
const configuration = shallowRef<QuickSnipConfiguration | null>(null);
const mode = ref<'studio' | 'raw'>('studio');
const format = ref<'mp4' | 'webm'>('mp4');
const automaticZoom = ref(true);
const microphone = ref(true);
const systemAudio = ref(false);
const camera = ref(false);
const presetOptions = ref<Array<{ label: string; value: string }>>([{ label: '', value: 'default' }]);
const selectedPresetId = ref('default');
const configured = ref(false);
const controlsEpoch = ref(0);
const actionPending = ref(false);
let settingsWrite = Promise.resolve();
let commandGeneration = 0;
const reportFailure = (reason: unknown) =>
  capture.reportQuickSnip({ type: 'failed', error: reason instanceof Error ? reason.message : String(reason) });
const recorder = useRecordingController(
  (session) => void capture.reportQuickSnip({ type: 'completed', session }),
  (failure) => void capture.reportQuickSnip({ type: 'failed', error: failure.message }),
);
const enabledDeviceId = (id: unknown, disabledId: string) =>
  typeof id === 'string' && id.length > 0 && id !== disabledId ? id : 'default';
const microphoneSourceId = computed(() =>
  microphone.value ? enabledDeviceId(configuration.value?.devices.micId, 'no-audio') : 'no-audio',
);
const { level: microphoneLevel } = useAudioLevelMeter(microphone, microphoneSourceId);
const recording = computed(() => recorder.phase.value === 'recording' || recorder.phase.value === 'paused');
const captureHint = computed(() => {
  const action = t(recording.value ? 'stop' : 'start');
  const shortcut = preferences.settings?.shortcuts?.['quickSnip.toggle']?.keys ?? 'Alt+Shift+S';
  return shortcut ? t('actionShortcut', { action, shortcut }) : action;
});
const preparing = computed(() => ['countdown', 'starting', 'finalizing'].includes(recorder.phase.value));
const settingsDisabled = computed(() => !configured.value || actionPending.value || preparing.value || recording.value);
const { level: systemAudioPreviewLevel } = useNativeSystemAudioPreview(
  computed(
    () => selectionActive.value && configured.value && systemAudio.value && !preparing.value && !recording.value,
  ),
);
const systemAudioLevel = computed(() =>
  recording.value ? recorder.systemAudioLevel.value : systemAudioPreviewLevel.value,
);
const elapsed = computed(() => {
  const value = recorder.recordingTime.value.replace(/\.\d$/, '');
  const [minutes, seconds] = value.split(':').map(Number);
  if (minutes < 60) return value;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const persistQuickSettings = async (overrides = quickSnipOverrides()) => {
  if (!configuration.value) return;
  const generation = commandGeneration;
  const document = await capture.getEditorPresets();
  if (generation !== commandGeneration) return;
  const preset = document.presets.find((candidate) => candidate.id === document.activePresetId);
  if (!preset) return;
  await capture.updateActiveEditorPreset({
    ...preset.settings,
    devices: overrides.devices,
    quickSnip: { automaticZoom: overrides.automaticZoom },
  });
};

const selectedDevices = () => ({
  ...configuration.value?.devices,
  micId: microphone.value ? enabledDeviceId(configuration.value?.devices.micId, 'no-audio') : 'no-audio',
  cameraId:
    mode.value === 'studio' && camera.value ? enabledDeviceId(configuration.value?.devices.cameraId, 'off') : 'off',
  systemAudioMode: systemAudio.value ? 'on' : 'off',
});
const quickSnipOverrides = () => ({
  mode: mode.value,
  format: format.value,
  automaticZoom: mode.value === 'studio' && automaticZoom.value,
  devices: selectedDevices(),
});
const synchronize = async () => {
  if (settingsDisabled.value) return;
  const generation = commandGeneration;
  const overrides = quickSnipOverrides();
  // Update the shortcut's job immediately; disk writes stay serialized in the background.
  settingsWrite = Promise.all([settingsWrite, capture.configureQuickSnip(overrides)]).then(async () => {
    if (generation === commandGeneration) await persistQuickSettings(overrides);
  });
  try {
    await settingsWrite;
  } catch (reason) {
    if (generation === commandGeneration) throw reason;
  }
};

const start = async () => {
  const current = configuration.value;
  if (!current) return;
  const generation = commandGeneration;
  actionPending.value = true;
  await settingsWrite;
  if (generation !== commandGeneration) return;
  await persistQuickSettings();
  if (generation !== commandGeneration) return;
  const devices = selectedDevices();
  await recorder.start({
    screenKind: current.screenKind,
    screenId: current.screenId,
    cameraId: devices.cameraId,
    microphoneId: devices.micId,
    systemAudio: systemAudio.value,
    targetFps: 60,
    countdownSeconds: 0,
    recordingBarVisibility: visibility.value,
    recordInteractions: mode.value === 'studio',
    region: current.region ? { ...current.region } : null,
    regionOverlay: null,
    outputRoot: mode.value === 'raw' ? current.rawOutputRoot : undefined,
    cursor: mode.value === 'studio',
    excludedWindowHandles: current.excludedWindowHandle ? [current.excludedWindowHandle] : [],
  });
};
const stop = () => recorder.stop();
const toggleFromControls = async () => {
  if (actionPending.value || preparing.value || !configured.value) return;
  const generation = commandGeneration;
  actionPending.value = true;
  try {
    if (recording.value) {
      await capture.quickSnipStop();
      return;
    }
    await settingsWrite;
    if (generation !== commandGeneration) return;
    await capture.quickSnipStart(quickSnipOverrides());
  } catch (reason) {
    if (generation === commandGeneration) await reportFailure(reason);
  } finally {
    if (generation === commandGeneration) actionPending.value = false;
  }
};
const cancel = () => {
  selectionActive.value = false;
  commandGeneration += 1;
  return capture.quickSnipCancel();
};
const selectPreset = async (id: string | number) => {
  if (settingsDisabled.value) return;
  const generation = commandGeneration;
  actionPending.value = true;
  try {
    const document = await capture.selectEditorPreset(String(id));
    if (generation !== commandGeneration) return;
    const preset = document.presets.find((candidate) => candidate.id === document.activePresetId);
    if (!preset || !configuration.value) return;
    selectedPresetId.value = preset.id;
    configuration.value = { ...configuration.value, preset, devices: preset.settings.devices };
    automaticZoom.value = preset.settings.quickSnip.automaticZoom;
    microphone.value = preset.settings.devices.micId !== 'no-audio';
    camera.value = preset.settings.devices.cameraId !== 'off';
    systemAudio.value = preset.settings.devices.systemAudioMode === 'on';
    actionPending.value = false;
    await synchronize();
  } catch (reason) {
    if (generation === commandGeneration) await reportFailure(reason);
  } finally {
    if (generation === commandGeneration) actionPending.value = false;
  }
};

const offConfigure = capture.onQuickSnipConfigure((next) => {
  if (next.name !== configuration.value?.name) {
    selectionActive.value = true;
    commandGeneration += 1;
    settingsWrite = Promise.resolve();
    actionPending.value = false;
  }
  configured.value = false;
  controlsEpoch.value += 1;
  configuration.value = next;
  mode.value = next.mode;
  format.value = next.format;
  automaticZoom.value = next.automaticZoom;
  selectedPresetId.value = next.preset.id;
  presetOptions.value = [{ label: next.preset.name, value: next.preset.id || 'default' }];
  microphone.value = next.devices.micId !== 'no-audio';
  camera.value = next.devices.cameraId !== 'off';
  systemAudio.value = next.devices.systemAudioMode === 'on';
  configured.value = true;
  const epoch = controlsEpoch.value;
  void capture
    .getEditorPresets()
    .then((document) => {
      if (epoch !== controlsEpoch.value) return;
      const available = document.presets.map((preset) => ({ label: preset.name, value: preset.id }));
      if (available.length > 0) presetOptions.value = available;
    })
    .catch((reason) => {
      if (epoch === controlsEpoch.value) return reportFailure(reason);
    });
});
const offCommand = capture.onQuickSnipCommand((command) => {
  selectionActive.value = false;
  if (command === 'cancel') commandGeneration += 1;
  const generation = commandGeneration;
  const operation = command === 'start' ? start() : command === 'stop' ? stop() : recorder.cancel();
  void operation
    .catch((reason) => {
      if (generation === commandGeneration) return reportFailure(reason);
    })
    .finally(() => {
      if (generation === commandGeneration) actionPending.value = false;
    });
});
const offState = capture.onQuickSnipState((snapshot) => {
  selectionActive.value = snapshot.state === 'selecting';
});
onMounted(() => {
  capture.notifyQuickSnipCropReady();
  void preferences.load().catch(reportFailure);
});
watch(recorder.phase, (phase) => {
  if (phase === 'recording') void capture.reportQuickSnip({ type: 'recording' });
});
watch([mode, format, automaticZoom, microphone, systemAudio, camera], () => void synchronize().catch(reportFailure), {
  flush: 'sync',
});
onBeforeUnmount(() => {
  commandGeneration += 1;
  controlsEpoch.value += 1;
  offConfigure();
  offCommand();
  offState();
});
</script>

<template>
  <main class="crop-shell">
    <section
      :key="controlsEpoch"
      class="crop-bar"
      :class="{
        'auto-fade': !selectionActive && visibility === 'auto-fade',
        'hover-only':
          !selectionActive && visibility === 'hover-only' && (recording || recorder.recorderHoverOnlyActive.value),
        'pointer-over': pointerOver,
      }"
      :aria-label="t('controls')"
      @pointerenter="pointerOver = true"
      @pointerleave="pointerOver = false"
    >
      <div class="drag-handle" :title="t('drag')" :aria-label="t('drag')">
        <GripVertical :size="16" aria-hidden="true" />
      </div>
      <div class="crop-controls">
        <div class="settings-row" role="group" :aria-label="t('settings')">
          <label
            class="setting-field mode-field"
            :title="t(mode === 'studio' ? 'studioHint' : 'rawHint')"
            @click="openSelect"
          >
            <component :is="mode === 'studio' ? WandSparkles : Video" :size="16" aria-hidden="true" />
            <span class="field-content">
              <span class="field-label">{{ t('mode') }}</span>
              <select
                class="mode-select"
                v-model="mode"
                :disabled="settingsDisabled"
                :aria-label="t('mode')"
                :title="t(mode === 'studio' ? 'studioHint' : 'rawHint')"
              >
                <option value="studio">{{ t('studio') }}</option>
                <option value="raw">{{ t('raw') }}</option>
              </select>
              <ChevronDown class="select-chevron" :size="12" aria-hidden="true" />
            </span>
          </label>
          <Divider orientation="vertical" spacing="none" class="field-divider" />
          <label
            v-if="mode === 'studio'"
            class="setting-field preset-field"
            :title="t('presetHint')"
            @click="openSelect"
          >
            <SlidersHorizontal :size="16" aria-hidden="true" />
            <span class="field-content">
              <span class="field-label">{{ t('preset') }}</span>
              <select
                class="preset-select"
                v-model="selectedPresetId"
                :disabled="settingsDisabled"
                :aria-label="t('presetHint')"
                :title="t('presetHint')"
                @change="selectPreset(selectedPresetId)"
              >
                <option v-for="preset in presetOptions" :key="preset.value" :value="preset.value">
                  {{ preset.value === 'default' ? t('defaultPreset') : preset.label }}
                </option>
              </select>
              <ChevronDown class="select-chevron" :size="12" aria-hidden="true" />
            </span>
          </label>
          <span v-else class="raw-description">{{ t('rawHint') }}</span>
          <Divider orientation="vertical" spacing="none" class="field-divider" />
          <label class="setting-field format-field" :title="t('formatHint')" @click="openSelect">
            <FileVideo :size="16" aria-hidden="true" />
            <span class="field-content">
              <span class="field-label">{{ t('format') }}</span>
              <select
                class="format-select"
                v-model="format"
                :disabled="settingsDisabled"
                :aria-label="t('formatHint')"
                :title="t('formatHint')"
              >
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
              </select>
              <ChevronDown class="select-chevron" :size="12" aria-hidden="true" />
            </span>
          </label>
        </div>
        <Divider spacing="none" />
        <div class="controls-row">
          <div class="control-group" role="group" :aria-label="t('devices')">
            <Button
              :variant="microphone ? 'secondary' : 'ghost'"
              size="sm"
              icon-only
              :title="t('microphone')"
              :aria-label="t('microphone')"
              :aria-pressed="microphone"
              :disabled="settingsDisabled"
              @click="microphone = !microphone"
            >
              <template #icon>
                <AudioIconMeter v-if="microphone" kind="mic" enabled :level="microphoneLevel" size="sm" />
                <span v-else class="toggle-icon is-off" aria-hidden="true"><MicOff :size="20" /></span>
              </template>
            </Button>
            <Button
              :variant="systemAudio ? 'secondary' : 'ghost'"
              size="sm"
              icon-only
              :title="t('systemAudio')"
              :aria-label="t('systemAudio')"
              :aria-pressed="systemAudio"
              :disabled="settingsDisabled"
              @click="systemAudio = !systemAudio"
            >
              <template #icon>
                <AudioIconMeter v-if="systemAudio" kind="system" enabled :level="systemAudioLevel" size="sm" />
                <span v-else class="toggle-icon is-off" aria-hidden="true"><VolumeOff :size="20" /></span>
              </template>
            </Button>
          </div>
          <template v-if="mode === 'studio'">
            <Divider orientation="vertical" spacing="none" class="control-divider" />
            <div class="control-group" role="group" :aria-label="t('effects')">
              <Button
                :variant="camera ? 'secondary' : 'ghost'"
                size="sm"
                icon-only
                :title="t('camera')"
                :aria-label="t('camera')"
                :aria-pressed="camera"
                :disabled="settingsDisabled"
                @click="camera = !camera"
              >
                <template #icon>
                  <span class="toggle-icon" :class="{ 'is-off': !camera }" aria-hidden="true">
                    <component :is="camera ? Camera : CameraOff" :size="20" />
                  </span>
                </template>
              </Button>
              <Button
                :variant="automaticZoom ? 'secondary' : 'ghost'"
                size="sm"
                icon-only
                :title="t('automaticZoom')"
                :aria-label="t('automaticZoom')"
                :aria-pressed="automaticZoom"
                :disabled="settingsDisabled"
                @click="automaticZoom = !automaticZoom"
              >
                <template #icon>
                  <span class="toggle-icon" :class="{ 'is-off': !automaticZoom }" aria-hidden="true">
                    <ZoomIn :size="20" />
                    <Slash v-if="!automaticZoom" :size="20" class="off-slash" />
                  </span>
                </template>
              </Button>
            </div>
          </template>
          <Divider orientation="vertical" spacing="none" class="control-divider" />
          <span v-if="recording" class="elapsed" role="timer" :aria-label="t('elapsed')">
            <span class="recording-dot" aria-hidden="true" />{{ elapsed }}
          </span>
          <div class="capture-actions">
            <Button
              variant="primary"
              size="sm"
              :icon="recording ? Square : Play"
              :title="captureHint"
              :loading="preparing || actionPending"
              :disabled="!configured || preparing || actionPending"
              @click="toggleFromControls"
              >{{ t(recording ? 'stop' : 'start') }}</Button
            >
            <Button
              variant="ghost"
              size="sm"
              icon-only
              :icon="X"
              :title="t('cancel')"
              :aria-label="t('cancel')"
              @click="cancel"
            />
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped src="./quick-snip-crop-bar.css"></style>
