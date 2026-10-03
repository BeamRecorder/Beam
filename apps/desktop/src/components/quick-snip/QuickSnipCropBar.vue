<script setup lang="ts">
import {
  Camera,
  CameraOff,
  Crop,
  GripVertical,
  MicOff,
  Monitor,
  PanelsTopLeft,
  Settings,
  VolumeOff,
  X,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import CaptureModeIcon from '../capture/CaptureModeIcon.vue';
import QuickSnipCaptureIcon from './QuickSnipCaptureIcon.vue';
import Divider from '~/ui/divider/Divider.vue';
import RafRevealTransition from '~/ui/transitions/RafRevealTransition.vue';
import AudioIconMeter from '../hud/audio/AudioIconMeter.vue';
import RecorderBar from '../hud/recorder/RecorderBar.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useQuickSnipCropBar } from './useQuickSnipCropBar';
import type { QuickSnipDeviceKind } from '~/api/types/quick-snip';
const { t } = useTranslate('QuickSnipCropBar');
const { t: hudT } = useTranslate('HUD');
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
const targets = [
  { id: 'screen', label: 'fullScreen', icon: Monitor },
  { id: 'region', label: 'region', icon: Crop },
  { id: 'window', label: 'window', icon: PanelsTopLeft },
] as const;
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
    <section
      v-else
      class="crop-bar"
      :aria-label="t('controls')"
      @pointerenter="pointerOver = true"
      @pointerleave="pointerOver = false"
    >
      <div class="drag-handle" :title="t('drag')"><GripVertical :size="16" aria-hidden="true" /></div>
      <div class="control-slot">
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
      <ButtonGroup
        size="sm"
        variant="neutral"
        class="control-slot capture-modes"
        :selection="{ index: displayMode === 'screenshot' ? 1 : 0, count: 2 }"
        :aria-label="t('mode')"
      >
        <Button
          v-for="choice in ['studio', 'screenshot'] as const"
          :key="choice"
          variant="tab"
          size="sm"
          :class="{ active: displayMode === choice }"
          :aria-pressed="displayMode === choice"
          :aria-label="t(choice === 'studio' ? 'video' : 'image')"
          :title="t(choice === 'studio' ? 'video' : 'image')"
          :disabled="settingsDisabled"
          @click="displayMode = choice"
        >
          <template #icon><CaptureModeIcon :mode="choice" decorative /></template
          >{{ t(choice === 'studio' ? 'video' : 'image') }}
        </Button>
      </ButtonGroup>
      <Divider orientation="vertical" spacing="none" class="control-divider" />
      <ButtonGroup
        size="sm"
        variant="neutral"
        class="control-slot"
        :selection="{ index: targets.findIndex((target) => target.id === captureTarget), count: 3 }"
        :aria-label="hudT('chooseCaptureSource')"
      >
        <Button
          v-for="target in targets"
          :key="target.id"
          variant="tab"
          size="sm"
          icon-only
          :style="{ width: '32px', height: '32px', padding: '0' }"
          :icon="target.icon"
          :class="{ active: captureTarget === target.id }"
          :aria-pressed="captureTarget === target.id"
          :aria-label="hudT(target.label)"
          :title="hudT(target.label)"
          :disabled="settingsDisabled"
          @click="selectSource(target.id)"
        />
      </ButtonGroup>
      <RafRevealTransition axis="horizontal">
        <div v-if="mode !== 'screenshot'" class="device-controls control-slot" role="group" :aria-label="t('devices')">
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :aria-label="t('microphone')"
            :aria-pressed="microphone"
            :title="t('microphone')"
            :disabled="settingsDisabled"
            data-quick-snip-menu-trigger
            @click="openDeviceMenu('microphone', $event)"
            @contextmenu.stop.prevent="openDeviceMenu('microphone', $event)"
            @keydown="onDeviceKeydown('microphone', $event)?.catch(reportFailure)"
          >
            <template #icon
              ><AudioIconMeter v-if="microphone" kind="mic" enabled :level="microphoneLevel" size="sm" /><MicOff
                v-else
                :size="18"
                class="is-off"
            /></template>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :aria-label="t('systemAudio')"
            :aria-pressed="systemAudio"
            :title="t('systemAudio')"
            :disabled="settingsDisabled"
            data-quick-snip-menu-trigger
            @click="openDeviceMenu('systemAudio', $event)"
            @contextmenu.stop.prevent="openDeviceMenu('systemAudio', $event)"
            @keydown="onDeviceKeydown('systemAudio', $event)?.catch(reportFailure)"
          >
            <template #icon
              ><AudioIconMeter v-if="systemAudio" kind="system" enabled :level="systemAudioLevel" size="sm" /><VolumeOff
                v-else
                :size="18"
                class="is-off"
            /></template>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :aria-label="t('camera')"
            :aria-pressed="camera"
            :title="t('camera')"
            :disabled="settingsDisabled"
            data-quick-snip-menu-trigger
            @click="openDeviceMenu('camera', $event)"
            @contextmenu.stop.prevent="openDeviceMenu('camera', $event)"
            @keydown="onDeviceKeydown('camera', $event)?.catch(reportFailure)"
          >
            <template #icon
              ><component :is="camera ? Camera : CameraOff" :size="18" :class="{ 'is-off': !camera }"
            /></template>
          </Button>
        </div>
      </RafRevealTransition>
      <div class="control-slot">
        <Button
          :variant="settingsOpen ? 'selected' : 'ghost'"
          size="sm"
          icon-only
          :icon="Settings"
          :aria-label="t('settings')"
          :title="t('settings')"
          :disabled="settingsDisabled"
          :aria-expanded="settingsOpen"
          aria-haspopup="dialog"
          data-quick-snip-menu-trigger
          @pointerdown="rememberSettingsIntent"
          @pointercancel="cancelSettingsIntent"
          @click="toggleSettings"
        />
      </div>
      <div class="capture-actions control-slot">
        <Button
          variant="primary"
          size="sm"
          :style="{ width: '40px', height: '40px', fontSize: '18px', borderRadius: 'var(--radius-full)' }"
          icon-only
          :title="captureHint"
          :aria-label="captureHint"
          :loading="preparing || actionPending"
          :disabled="!configured || preparing || actionPending || deviceMenuBusy"
          @click="toggleFromControls()"
        >
          <template #icon>
            <QuickSnipCaptureIcon :screenshot="mode === 'screenshot'" />
          </template>
        </Button>
      </div>
    </section>
  </main>
</template>
<style scoped src="./quick-snip-crop-bar.css"></style>
