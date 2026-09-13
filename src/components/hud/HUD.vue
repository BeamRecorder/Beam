<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import type { EditorLoadingProgress, RecorderLauncherContext } from '~/api/types/capture-api';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import TopbarHUD from './TopbarHUD.vue';
import SourceSelect from './SourceSelect.vue';
import { Monitor, Layout, ArrowUpRight, Video, VideoOff, Crop, ScrollText, Check } from '@lucide/vue';
import AudioIconMeter from './audio/AudioIconMeter.vue';
import EditorPreparingHud from './EditorPreparingHud.vue';
import InteractionAccessControl from './interactions/InteractionAccessControl.vue';
import HudIssue from './HudIssue.vue';
import { useHudState } from './useHudState';
import CapturePresetSelect from './CapturePresetSelect.vue';
import KeyboardChip from '~/ui/Kbd/KeyboardChip.vue';
const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    showTopbar?: boolean;
    preparingEditor?: boolean;
    editorLoadingProgress?: EditorLoadingProgress;
    externalError?: string;
    recorderLauncherContext?: RecorderLauncherContext | null;
  }>(),
  {
    embedded: false,
    showTopbar: false,
    preparingEditor: false,
    editorLoadingProgress: () => ({ stage: 'openingWindow', value: 10 }),
    recorderLauncherContext: null,
  },
);

const emit = defineEmits(['start-recording', 'stop-recording', 'open-project', 'focus-feature', 'dismiss-launcher']);
const ProjectPicker = defineAsyncComponent(() => import('../projects/ProjectPicker.vue'));
const HudPreferences = defineAsyncComponent(() => import('./settings/HudPreferences.vue'));

const {
  captureMode,
  modeShortcut,
  t,
  tPrefs,
  desktopPlatform,
  activeTab,
  isRecording,
  isBusy,
  sources,
  sourceDiscoveryCompleted,
  showSettings,
  settingsView,
  showProjectPicker,
  countdownSeconds,
  recordingBarVisibility,
  interactionAccess,
  hudIssues,
  windowPreviews,
  screenPreviews,
  windowPreviewsLoading,
  screenPreviewsLoading,
  selectedSourceId,
  cameraOptions,
  selectedCameraId,
  micOptions,
  selectedMicId,
  isTeleprompterVisible,
  selectedScreenId,
  systemAudioMode,
  micLevel,
  systemAudioLevel,
  displaySources,
  hasSelectedCaptureSource,
  selectedScreenBounds,
  selectedScreenRegion,
  isRegionSelectionLeaving,
  isRegionSelectionEntering,
  isRegionConfirmationAnimating,
  activeDropdowns,
  hudHeight,
  handleDropdownToggle,
  handleSourceDropdownToggle,
  selectScreenRegion,
  systemAudioOptions,
  recordingTime,
  authorizeInteractionAccess,
  handleHudIssueAction,
  toggleRecording,
  toggleTeleprompter,
  closeApp,
  minimizeApp,
  openProjectPicker,
  closeProjectPicker,
  handleTopbarBack,
  openProject,
} = useHudState(props, emit);
</script>

<template>
  <div
    class="hud-wrapper"
    :class="[
      activeTab,
      {
        embedded,
        'settings-open': showSettings,
        'dropdown-open': activeDropdowns > 0,
        'region-selection-leaving': isRegionSelectionLeaving,
        'region-selection-entering': isRegionSelectionEntering,
      },
    ]"
    :style="embedded ? {} : { height: `${hudHeight}px` }"
  >
    <TopbarHUD
      v-if="!embedded || showTopbar"
      :title="
        preparingEditor
          ? t('preparingEditor')
          : showProjectPicker
            ? t('openProject')
            : showSettings
              ? settingsView === 'shortcuts'
                ? tPrefs('keyboardShortcuts')
                : settingsView === 'about'
                  ? tPrefs('about')
                  : tPrefs('preferences')
              : t('title')
      "
      :show-back="!preparingEditor && (showProjectPicker || showSettings)"
      :show-settings="!preparingEditor && !showSettings && !showProjectPicker"
      :is-recording="isRecording"
      v-model:mode="captureMode"
      :mode-disabled="isBusy || preparingEditor || Boolean(recorderLauncherContext)"
      @back="handleTopbarBack"
      @minimize="minimizeApp"
      @open-settings="
        showSettings = true;
        emit('focus-feature', 'topbar');
      "
      @close="closeApp"
    />

    <Transition name="hud-view" mode="out-in">
      <EditorPreparingHud v-if="preparingEditor" key="editor-preparing" :progress="editorLoadingProgress" />

      <!-- Project Picker View -->
      <ProjectPicker
        v-else-if="showProjectPicker"
        key="project-picker"
        @back="closeProjectPicker"
        @open-project="openProject"
        @toggle-popover="handleDropdownToggle"
      />

      <HudPreferences
        v-else-if="showSettings"
        key="settings"
        v-model:view="settingsView"
        :countdown-seconds="countdownSeconds"
        :recording-bar-visibility="recordingBarVisibility"
        :input-access="interactionAccess.status.value"
        :record-interactions="interactionAccess.enabled.value"
        :requesting-input-access="interactionAccess.requesting.value"
        :platform="desktopPlatform"
        @update:countdown-seconds="countdownSeconds = $event"
        @update:recording-bar-visibility="recordingBarVisibility = $event"
        @update:record-interactions="interactionAccess.setEnabled"
        @request-input-access="authorizeInteractionAccess"
        @close="showSettings = false"
      />

      <!-- Main HUD Form -->
      <div v-else key="hud" class="hud-body">
        <!-- Tabs (Screen / Window) -->
        <ButtonGroup class="mode-tabs">
          <Button
            :class="{ active: activeTab === 'screen' }"
            variant="tab"
            @click="
              activeTab = 'screen';
              emit('focus-feature', 'tabs');
            "
          >
            <template #icon><Monitor class="btn-icon" /></template>
            {{ t('screen') }}
          </Button>
          <Button
            :class="{ active: activeTab === 'window' }"
            variant="tab"
            @click="
              activeTab = 'window';
              emit('focus-feature', 'tabs');
            "
          >
            <template #icon><Layout class="btn-icon" /></template>
            {{ t('window') }}
          </Button>
        </ButtonGroup>

        <Transition name="fade-slide" mode="out-in">
          <CapturePresetSelect :key="captureMode" v-if="captureMode === 'instant'" kind="video" :disabled="isBusy" />
        </Transition>
        <div class="form-inputs-area">
          <Transition name="fade-slide" mode="out-in">
            <div :key="`${activeTab}:${captureMode}`" class="tab-content-container">
              <!-- Linux uses the system Portal picker at recording start, but region selection remains available here. -->
              <template v-if="activeTab === 'window'">
                <template v-if="desktopPlatform !== 'linux'">
                  <div class="device-row">
                    <Layout class="device-icon" />
                    <SourceSelect
                      v-model="selectedSourceId"
                      kind="window"
                      :sources="sources"
                      :previews="windowPreviews"
                      :prefer-native-sources="desktopPlatform === 'darwin'"
                      :loading="windowPreviewsLoading"
                      :disabled="isRecording || isBusy"
                      @toggle="
                        handleSourceDropdownToggle('window', $event);
                        if ($event) emit('focus-feature', 'source');
                      "
                    />
                  </div>
                </template>
              </template>

              <div v-else class="device-row">
                <Monitor class="device-icon" />
                <div class="screen-select-controls">
                  <SourceSelect
                    v-if="desktopPlatform !== 'linux'"
                    v-model="selectedScreenId"
                    kind="screen"
                    :sources="sources"
                    :previews="screenPreviews"
                    :loading="screenPreviewsLoading"
                    :disabled="isRecording || isBusy || displaySources.length === 0"
                    @toggle="
                      handleSourceDropdownToggle('screen', $event);
                      if ($event) emit('focus-feature', 'source');
                    "
                  />
                  <Button
                    :variant="selectedScreenRegion ? 'primary' : 'secondary'"
                    size="sm"
                    :icon-only="desktopPlatform !== 'linux'"
                    :block="desktopPlatform === 'linux'"
                    :icon="isRegionConfirmationAnimating ? Check : Crop"
                    :aria-label="selectedScreenRegion ? t('screenRegionSelected') : t('selectScreenRegion')"
                    :tooltip="selectedScreenRegion ? t('editScreenRegion') : t('selectScreenRegion')"
                    :disabled="isRecording || isBusy || (desktopPlatform !== 'linux' && !selectedScreenBounds)"
                    :class="{
                      'screen-region-confirmed': Boolean(selectedScreenRegion),
                      'screen-region-checkmark': isRegionConfirmationAnimating,
                    }"
                    @click="
                      selectScreenRegion();
                      emit('focus-feature', 'source');
                    "
                  >
                    <template v-if="desktopPlatform === 'linux'">
                      {{ selectedScreenRegion ? t('editScreenRegion') : t('selectScreenRegion') }}
                    </template>
                  </Button>
                </div>
              </div>

              <!-- Audio and input devices -->
              <div v-if="captureMode !== 'screenshot'" class="selectors-stack">
                <div class="device-row">
                  <AudioIconMeter
                    class="device-icon"
                    kind="system"
                    :enabled="systemAudioMode === 'on'"
                    :level="systemAudioLevel"
                  />
                  <Select
                    v-model="systemAudioMode"
                    :options="systemAudioOptions"
                    :disabled="isRecording || isBusy"
                    @toggle="
                      handleDropdownToggle($event);
                      if ($event) emit('focus-feature', 'systemAudio');
                    "
                  />
                </div>

                <div class="device-row">
                  <AudioIconMeter
                    class="device-icon"
                    kind="mic"
                    :enabled="selectedMicId !== 'no-audio'"
                    :level="micLevel"
                  />
                  <div class="mic-select-controls">
                    <div v-if="isBusy && sources.length === 0">
                      <Skeleton variant="radial" height="2.75rem" radius="var(--radius-md)" />
                    </div>
                    <Select
                      v-else
                      v-model="selectedMicId"
                      :options="micOptions"
                      :disabled="isRecording || isBusy"
                      @toggle="
                        handleDropdownToggle($event);
                        if ($event) emit('focus-feature', 'mic');
                      "
                    />
                    <Button
                      :variant="isTeleprompterVisible ? 'primary' : 'secondary'"
                      size="sm"
                      icon-only
                      :icon="ScrollText"
                      :aria-label="isTeleprompterVisible ? t('closeTeleprompter') : t('openTeleprompter')"
                      :tooltip="isTeleprompterVisible ? t('closeTeleprompter') : t('openTeleprompter')"
                      :disabled="isBusy"
                      :class="{ 'teleprompter-active': isTeleprompterVisible }"
                      @click="
                        toggleTeleprompter();
                        emit('focus-feature', 'teleprompter');
                      "
                    />
                  </div>
                </div>

                <div class="device-row">
                  <component
                    :is="selectedCameraId === 'off' ? VideoOff : Video"
                    class="device-icon"
                    :class="{ 'is-unavailable': selectedCameraId === 'off' }"
                  />
                  <div v-if="isBusy && sources.length === 0">
                    <Skeleton variant="linear" height="2.75rem" radius="var(--radius-md)" />
                  </div>
                  <Select
                    v-else
                    v-model="selectedCameraId"
                    :options="cameraOptions"
                    :disabled="isRecording || isBusy"
                    @toggle="
                      handleDropdownToggle($event);
                      if ($event) emit('focus-feature', 'camera');
                    "
                  />
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <div class="recording-action-stack" :class="{ 'has-issues': hudIssues.length > 0 }">
          <TransitionGroup v-if="hudIssues.length > 0" name="hud-issue" tag="div" class="hud-issues">
            <HudIssue v-for="issue in hudIssues" :key="issue.id" :issue="issue" @action="handleHudIssueAction">
              <template v-if="issue.id === 'interaction-access'" #action>
                <InteractionAccessControl
                  class="hud-issue-action"
                  :status="interactionAccess.status.value"
                  :enabled="interactionAccess.enabled.value"
                  :requesting="interactionAccess.requesting.value"
                  :enable-label="t('authorizeInteractions')"
                  :enabling-label="t('authorizingInteractions')"
                  :checking-label="tPrefs('checkingAccess')"
                  :unavailable-label="tPrefs('accessUnavailable')"
                  @request="authorizeInteractionAccess"
                  @update:enabled="interactionAccess.setEnabled"
                />
              </template>
            </HudIssue>
          </TransitionGroup>

          <!-- Action Button (Centered Capsule) -->
          <div class="action-section">
            <Button
              :variant="isRecording ? 'outline' : 'primary'"
              size="md"
              :block="true"
              class="record-btn-override"
              :class="{ recording: isRecording }"
              :disabled="
                isBusy ||
                interactionAccess.requesting.value ||
                (!isRecording && sourceDiscoveryCompleted && !hasSelectedCaptureSource)
              "
              @click="
                toggleRecording();
                emit('focus-feature', 'record');
              "
            >
              <template #icon>
                <span class="pulse-dot" v-if="isRecording"></span>
              </template>
              {{
                isBusy
                  ? t('pleaseWait')
                  : isRecording
                    ? t('stopRecording', { time: recordingTime })
                    : captureMode === 'screenshot'
                      ? t('screenshot')
                      : captureMode === 'instant'
                        ? t('instant')
                        : t('startRecording')
              }}
            </Button>
          </div>
        </div>

        <div v-if="captureMode !== 'studio'" class="mode-shortcut">
          <span>{{ t('quickSnip') }}</span
          ><KeyboardChip :shortcut="modeShortcut" />
        </div>
        <!-- Open existing project button (Subtle style) -->
        <div class="web-link-container">
          <Button
            variant="link"
            size="sm"
            class="web-link-text project-btn"
            :icon="ArrowUpRight"
            @click="
              openProjectPicker();
              emit('focus-feature', 'projects');
            "
          >
            {{ t('openExistingProject') }}
          </Button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped src="./hud-shell.css"></style>
<style scoped src="./hud-form.css"></style>
