<script setup lang="ts">
import QuickSnipSelectionBar from './QuickSnipSelectionBar.vue';
import RecorderBar from '../hud/recorder/RecorderBar.vue';
import { useQuickSnipCropBar } from './useQuickSnipCropBar';
import type { QuickSnipDeviceKind } from '~/api/types/quick-snip';
const {
  visibility,
  pointerOver,
  recording,
  recorder,
  displayMode,
  mode,
  settingsDisabled,
  microphone,
  microphoneLevel,
  systemAudio,
  systemAudioLevel,
  camera,
  elapsed,
  captureHint,
  preparing,
  actionPending,
  configured,
  toggleFromControls,
  cancel,
  deviceMenuBusy,
  chooseDevice,
  onDeviceKeydown,
  reportFailure,
  restart,
  compact,
  captureTarget,
  selectSource,
  openSettings,
  settingsOpen,
  dismissSettings,
} = useQuickSnipCropBar();
const openDeviceMenu = (kind: QuickSnipDeviceKind, event: MouseEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  void chooseDevice(kind, { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.bottom) }).catch(
    reportFailure,
  );
};
let closeSettingsOnClick: boolean | null = null;
const rememberSettingsIntent = () => {
  closeSettingsOnClick = settingsOpen.value;
};
const cancelSettingsIntent = () => {
  closeSettingsOnClick = null;
};
const toggleSettings = (event: MouseEvent) => {
  const close = closeSettingsOnClick ?? settingsOpen.value;
  closeSettingsOnClick = null;
  if (close) {
    dismissSettings();
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  void openSettings({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
};
const closeSettingsOutsideTrigger = (event: PointerEvent) => {
  if (settingsOpen.value && !(event.target as Element).closest('[data-quick-snip-menu-trigger]')) dismissSettings();
};
</script>
<template>
  <main class="crop-shell" @contextmenu.prevent @pointerdown.capture="closeSettingsOutsideTrigger">
    <RecorderBar
      v-if="compact"
      :phase="recorder.phase.value"
      :recording-time="elapsed"
      :visibility="visibility"
      :hover-only-active="recording || recorder.recorderHoverOnlyActive.value"
      :busy="actionPending && recorder.phase.value !== 'starting'"
      :mascot="mode === 'instant'"
      @stop="recording ? toggleFromControls() : cancel()"
      @cancel="cancel"
      @pause="recorder.togglePause"
      @restart="restart"
    />
    <QuickSnipSelectionBar
      v-else
      :state="{
        displayMode,
        mode,
        settingsDisabled,
        microphone,
        microphoneLevel,
        systemAudio,
        systemAudioLevel,
        camera,
        captureTarget,
        settingsOpen,
        captureHint,
        preparing,
        actionPending,
        configured,
        deviceMenuBusy,
      }"
      @pointer-over="pointerOver = $event"
      @cancel="cancel"
      @update:display-mode="displayMode = $event"
      @select-source="selectSource"
      @device-menu="openDeviceMenu"
      @device-keydown="(kind, event) => onDeviceKeydown(kind, event)?.catch(reportFailure)"
      @settings-intent="rememberSettingsIntent"
      @cancel-settings-intent="cancelSettingsIntent"
      @toggle-settings="toggleSettings"
      @capture="toggleFromControls()"
    />
  </main>
</template>
<style scoped src="./quick-snip-crop-bar.css"></style>
