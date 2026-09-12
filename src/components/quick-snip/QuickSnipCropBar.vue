<script setup lang="ts">
import {
  Camera,
  CameraOff,
  ChevronDown,
  Clapperboard,
  GripVertical,
  MicOff,
  Play,
  ScanLine,
  Slash,
  Square,
  VolumeOff,
  X,
  ZoomIn,
} from '@lucide/vue';
import Button from '~/ui/button/Button.vue';
import CaptureModeGroup from '../hud/CaptureModeGroup.vue';
import Divider from '~/ui/divider/Divider.vue';
import AudioIconMeter from '~/components/hud/audio/AudioIconMeter.vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useQuickSnipCropBar } from './useQuickSnipCropBar';
const { t } = useTranslate('QuickSnipCropBar');
const {
  visibility,
  pointerOver,
  selectionActive,
  recording,
  recorder,
  displayMode,
  mode,
  settingsDisabled,
  selectedPresetId,
  presetOptions,
  selectPreset,
  microphone,
  microphoneLevel,
  systemAudio,
  systemAudioLevel,
  camera,
  automaticZoom,
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
} = useQuickSnipCropBar();
const openSelect = (event: MouseEvent) => {
  const select = (event.currentTarget as HTMLElement).querySelector('select')!;
  if (select.disabled || (event.target as Element).closest('select')) return;
  event.preventDefault();
  select.focus();
  select.showPicker();
};
</script>

<template>
  <main class="crop-shell">
    <section
      class="crop-bar"
      :class="{
        'auto-fade': mode !== 'screenshot' && !selectionActive && visibility === 'auto-fade',
        'hover-only':
          mode !== 'screenshot' &&
          !selectionActive &&
          visibility === 'hover-only' &&
          (recording || recorder.recorderHoverOnlyActive.value),
        'pointer-over': pointerOver || deviceMenuBusy,
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
          <CaptureModeGroup
            class="quick-modes"
            v-model="displayMode"
            :modes="['studio', 'screenshot']"
            full
            labels
            :disabled="settingsDisabled"
          />
          <Divider orientation="vertical" spacing="none" class="field-divider" />
          <label class="setting-field preset-field" :title="t('presetHint')" @click="openSelect">
            <component :is="mode === 'screenshot' ? ScanLine : Clapperboard" :size="16" aria-hidden="true" />
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
        </div>
        <Divider spacing="none" />
        <Transition name="quick-controls" mode="out-in">
          <div :key="mode === 'screenshot' ? 'screenshot' : 'video'" class="controls-row">
            <div v-if="mode !== 'screenshot'" class="control-group" role="group" :aria-label="t('devices')">
              <Button
                :variant="microphone ? 'secondary' : 'ghost'"
                size="sm"
                icon-only
                :title="t('deviceHint', { device: t('microphone') })"
                :aria-label="t('microphone')"
                :aria-pressed="microphone"
                :disabled="settingsDisabled"
                @contextmenu.prevent="chooseDevice('microphone').catch(reportFailure)"
                @keydown="onDeviceKeydown('microphone', $event)?.catch(reportFailure)"
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
                :title="t('deviceHint', { device: t('systemAudio') })"
                :aria-label="t('systemAudio')"
                :aria-pressed="systemAudio"
                :disabled="settingsDisabled"
                @contextmenu.prevent="chooseDevice('systemAudio').catch(reportFailure)"
                @keydown="onDeviceKeydown('systemAudio', $event)?.catch(reportFailure)"
                @click="systemAudio = !systemAudio"
              >
                <template #icon>
                  <AudioIconMeter v-if="systemAudio" kind="system" enabled :level="systemAudioLevel" size="sm" />
                  <span v-else class="toggle-icon is-off" aria-hidden="true"><VolumeOff :size="20" /></span>
                </template>
              </Button>
            </div>
            <template v-if="mode !== 'screenshot'">
              <Divider orientation="vertical" spacing="none" class="control-divider" />
              <div class="control-group" role="group" :aria-label="t('effects')">
                <Button
                  :variant="camera ? 'secondary' : 'ghost'"
                  size="sm"
                  icon-only
                  :title="t('deviceHint', { device: t('camera') })"
                  :aria-label="t('camera')"
                  :aria-pressed="camera"
                  :disabled="settingsDisabled"
                  @contextmenu.prevent="chooseDevice('camera').catch(reportFailure)"
                  @keydown="onDeviceKeydown('camera', $event)?.catch(reportFailure)"
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
            <Divider v-if="mode !== 'screenshot'" orientation="vertical" spacing="none" class="control-divider" />
            <span v-if="recording" class="elapsed" role="timer" :aria-label="t('elapsed')">
              <span class="recording-dot" aria-hidden="true" />{{ elapsed }}
            </span>
            <div class="capture-actions">
              <Button
                variant="primary"
                size="sm"
                :icon="mode === 'screenshot' ? ScanLine : recording ? Square : Play"
                :title="captureHint"
                :loading="preparing || actionPending"
                :disabled="!configured || preparing || actionPending || deviceMenuBusy"
                @click="toggleFromControls()"
                >{{ mode === 'screenshot' ? t('screenshot') : t(recording ? 'stop' : 'start') }}</Button
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
        </Transition>
      </div>
    </section>
  </main>
</template>

<style scoped src="./quick-snip-crop-bar.css"></style>
