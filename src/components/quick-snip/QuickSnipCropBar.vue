<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Camera, GripVertical, Play, Square, X } from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import Switch from '~/ui/switch/Switch.vue';
import { capture } from '~/api/capture';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import { useRecordingController } from '~/components/hud/recorder/useRecordingController';
import { useAudioLevelMeter } from '~/components/hud/audio/useAudioLevelMeter';
import AudioIconMeter from '~/components/hud/audio/AudioIconMeter.vue';

const configuration = ref<QuickSnipConfiguration | null>(null);
const mode = ref<'studio' | 'raw'>('studio');
const format = ref<'mp4' | 'webm'>('mp4');
const automaticZoom = ref(true);
const microphone = ref(true);
const systemAudio = ref(false);
const camera = ref(false);
const presetOptions = ref<Array<{ label: string; value: string }>>([{ label: 'Default', value: 'default' }]);
const selectedPresetId = ref('default');
const configured = ref(false);
const controlsEpoch = ref(0);
const recorder = useRecordingController(
  (session) => void capture.reportQuickSnip({ type: 'completed', session }),
  (failure) => void capture.reportQuickSnip({ type: 'failed', error: failure.message }),
);
const microphoneSourceId = computed(() =>
  microphone.value ? String(configuration.value?.preset.settings.devices.micId || 'default') : 'no-audio',
);
const { level: microphoneLevel } = useAudioLevelMeter(microphone, microphoneSourceId);
const recording = computed(() => recorder.phase.value === 'recording' || recorder.phase.value === 'paused');
const preparing = computed(() => ['countdown', 'starting', 'finalizing'].includes(recorder.phase.value));
const elapsed = computed(() => {
  const value = recorder.recordingTime.value.replace(/\.\d$/, '');
  const [minutes, seconds] = value.split(':').map(Number);
  if (minutes < 60) return value;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
});

const persistQuickSettings = async () => {
  if (!configuration.value) return;
  const document = await capture.getEditorPresets();
  const preset = document.presets.find((candidate) => candidate.id === document.activePresetId);
  if (!preset) return;
  const devices = {
    ...preset.settings.devices,
    micId: microphone.value ? String(preset.settings.devices.micId || 'default') : 'no-audio',
    cameraId: mode.value === 'studio' && camera.value ? String(preset.settings.devices.cameraId || 'default') : 'off',
    systemAudioMode: systemAudio.value ? 'on' : 'off',
  };
  await capture.updateActiveEditorPreset({
    ...preset.settings,
    devices,
    quickSnip: { automaticZoom: automaticZoom.value },
  });
};

const selectedDevices = () => ({
  ...(configuration.value?.preset.settings.devices ?? {}),
  micId: microphone.value ? String(configuration.value?.preset.settings.devices.micId || 'default') : 'no-audio',
  cameraId:
    mode.value === 'studio' && camera.value
      ? String(configuration.value?.preset.settings.devices.cameraId || 'default')
      : 'off',
  systemAudioMode: systemAudio.value ? 'on' : 'off',
});
const quickSnipOverrides = () => ({
  mode: mode.value,
  format: format.value,
  automaticZoom: mode.value === 'studio' && automaticZoom.value,
  devices: selectedDevices(),
});
const synchronize = async () => {
  if (!configured.value) return;
  await persistQuickSettings();
  await capture.configureQuickSnip(quickSnipOverrides());
};

const start = async () => {
  const current = configuration.value;
  if (!current) return;
  await persistQuickSettings();
  await recorder.start({
    screenKind: 'display',
    screenId: current.screenId,
    cameraId:
      mode.value === 'studio' && camera.value ? String(current.preset.settings.devices.cameraId || 'default') : 'off',
    microphoneId: microphone.value ? String(current.preset.settings.devices.micId || 'default') : 'no-audio',
    systemAudio: systemAudio.value,
    targetFps: 60,
    countdownSeconds: 0,
    recordingBarVisibility: 'always',
    recordInteractions: mode.value === 'studio',
    region: current.region,
    regionOverlay: null,
    outputRoot: mode.value === 'raw' ? current.rawOutputRoot : undefined,
    cursor: mode.value === 'studio',
    excludedWindowHandles: current.excludedWindowHandle ? [current.excludedWindowHandle] : [],
  });
};
const stop = () => recorder.stop();
const toggleFromControls = async () => {
  if (recording.value) {
    await capture.quickSnipToggle();
    return;
  }
  await capture.configureQuickSnip(quickSnipOverrides());
  await capture.quickSnipToggle();
};
const cancel = async () => {
  await capture.quickSnipCancel();
  await recorder.cancel();
};
const selectPreset = async (id: string | number) => {
  const document = await capture.selectEditorPreset(String(id));
  const preset = document.presets.find((candidate) => candidate.id === document.activePresetId);
  if (!preset || !configuration.value) return;
  selectedPresetId.value = preset.id;
  configuration.value = { ...configuration.value, preset };
  automaticZoom.value = preset.settings.quickSnip.automaticZoom;
  await synchronize();
};

const offConfigure = capture.onQuickSnipConfigure(async (next) => {
  controlsEpoch.value += 1;
  configuration.value = next;
  mode.value = next.mode;
  format.value = next.format;
  automaticZoom.value = next.automaticZoom;
  selectedPresetId.value = next.preset.id;
  presetOptions.value = [{ label: next.preset.name || 'Default', value: next.preset.id || 'default' }];
  microphone.value = next.preset.settings.devices.micId !== 'no-audio';
  camera.value = next.preset.settings.devices.cameraId !== 'off';
  systemAudio.value = next.preset.settings.devices.systemAudioMode === 'on';
  const document = await capture.getEditorPresets();
  const available = document.presets.map((preset) => ({ label: preset.name, value: preset.id }));
  if (available.length > 0) presetOptions.value = available;
  configured.value = true;
});
const offCommand = capture.onQuickSnipCommand((command) => {
  if (command === 'start') void start();
  else if (command === 'stop') void stop();
  else void cancel();
});
watch(recorder.phase, (phase) => {
  if (phase === 'recording') void capture.reportQuickSnip({ type: 'recording' });
});
watch([mode, format, automaticZoom, microphone, systemAudio, camera], () => void synchronize());
onBeforeUnmount(() => {
  offConfigure();
  offCommand();
});
</script>

<template>
  <main class="crop-shell">
    <section :key="controlsEpoch" class="crop-bar" aria-label="Quick Snip controls">
      <div class="drag-handle" title="Drag Quick Snip controls" aria-label="Drag Quick Snip controls">
        <GripVertical :size="16" />
      </div>
      <select class="mode-select" v-model="mode" aria-label="Quick Snip mode">
        <option value="studio">Studio</option>
        <option value="raw">Raw</option>
      </select>
      <select
        class="preset-select"
        v-model="selectedPresetId"
        :disabled="mode === 'raw'"
        aria-label="Editor preset"
        @change="selectPreset(selectedPresetId)"
      >
        <option v-for="preset in presetOptions" :key="preset.value" :value="preset.value">{{ preset.label }}</option>
      </select>
      <select class="format-select" v-model="format" aria-label="Video format">
        <option value="mp4">MP4</option>
        <option value="webm">WebM</option>
      </select>
      <Switch v-if="mode === 'studio'" v-model="automaticZoom" aria-label="Automatic zoom" label="Zoom" />
      <Button
        variant="ghost"
        size="sm"
        :class="{ active: microphone }"
        title="Microphone"
        aria-label="Microphone"
        @click="microphone = !microphone"
      >
        <template #icon>
          <AudioIconMeter kind="mic" :enabled="microphone" :level="microphoneLevel" size="sm" />
        </template>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="{ active: systemAudio }"
        title="System audio"
        aria-label="System audio"
        @click="systemAudio = !systemAudio"
      >
        <template #icon>
          <AudioIconMeter
            kind="system"
            :enabled="systemAudio"
            :level="recorder.systemAudioLevel?.value ?? 0"
            size="sm"
          />
        </template>
      </Button>
      <Button
        v-if="mode === 'studio'"
        variant="ghost"
        size="sm"
        :icon="Camera"
        :class="{ active: camera }"
        title="Camera"
        aria-label="Camera"
        @click="camera = !camera"
      />
      <span v-if="recording" class="elapsed" aria-live="polite">{{ elapsed }}</span>
      <Button
        variant="primary"
        size="sm"
        :icon="recording ? Square : Play"
        :disabled="preparing"
        @click="toggleFromControls"
        >{{ recording ? 'Stop' : 'Start' }}</Button
      >
      <Button variant="ghost" size="sm" :icon="X" title="Cancel" aria-label="Cancel" @click="cancel" />
    </section>
  </main>
</template>

<style scoped>
.crop-shell {
  position: fixed;
  inset: 0;
  box-sizing: border-box;
}
.crop-bar {
  position: absolute;
  top: 10px;
  right: 10px;
  left: 10px;
  height: 64px;
  padding: 8px 10px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-element);
  box-shadow: var(--shadow-lg);
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.drag-handle {
  width: 18px;
  height: 36px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--text-secondary);
  cursor: grab;
  -webkit-app-region: drag;
  app-region: drag;
}
.crop-bar select {
  min-width: 0;
  height: 34px;
  padding: 0 24px 0 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: var(--color-bg-surface);
  font: inherit;
  font-size: 13px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
.crop-bar select:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.mode-select {
  width: 96px;
}
.preset-select {
  width: 136px;
}
.format-select {
  width: 82px;
}
.active {
  color: var(--color-primary);
  background: var(--color-primary-light);
}
.elapsed {
  min-width: 54px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--text-primary);
}
</style>
