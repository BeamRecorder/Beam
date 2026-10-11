<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { CaptureMode } from '@beam/engine/capture/capture-mode';
import { Camera, CameraOff, ScrollText } from '@lucide/vue';
import type { EditorLoadingProgress, RecorderLauncherContext } from '~/api/types/capture-api';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import TopbarHUD from './TopbarHUD.vue';
import CaptureModeGroup from './CaptureModeGroup.vue';
import HudCaptureCards from './HudCaptureCards.vue';
import AudioIconMeter from './audio/AudioIconMeter.vue';
import EditorPreparingHud from './EditorPreparingHud.vue';
import InteractionAccessControl from './interactions/InteractionAccessControl.vue';
import HudIssue from './HudIssue.vue';
import HudIssuesPopover from './HudIssuesPopover.vue';
import { useHudState } from './useHudState';
import CapturePresetSelect from './CapturePresetSelect.vue';
import KeyboardChip from '~/ui/Kbd/KeyboardChip.vue';
import type { HudCaptureTarget } from './hud-state-types';
import { useHudPopoverViewport } from './useHudPopoverViewport';

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    embeddedCaptureMode?: CaptureMode;
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
const emit = defineEmits([
  'start-recording',
  'stop-recording',
  'open-project',
  'focus-feature',
  'dismiss-launcher',
  'popover-toggle',
  'cancel-editor-opening',
  'update:capture-mode',
]);
const popoverViewport = useHudPopoverViewport(props.embedded);
const presetError = ref('');
const {
  captureMode,
  modeShortcut,
  t,
  tPrefs,
  isRecording,
  isBusy,
  errorMessage,
  cameraOptions,
  selectedCameraId,
  micOptions,
  selectedMicId,
  systemAudioMode,
  systemAudioOptions,
  micLevel,
  systemAudioLevel,
  isTeleprompterVisible,
  interactionAccess,
  hudIssues,
  isRegionSelectionLeaving,
  isRegionSelectionEntering,
  hudHeight,
  captureTarget,
  choosingSource,
  chooseCapture,
  activeDropdowns,
  handleDropdownToggle,
  handleHudIssueAction,
  authorizeInteractionAccess,
  toggleTeleprompter,
  closeApp,
  minimizeApp,
  openPanel,
} = useHudState(props, emit);
const issues = computed(() => {
  const rows = hudIssues.value.filter((issue) => issue.tone !== 'success');
  if (props.externalError && errorMessage.value && props.externalError !== errorMessage.value) {
    rows.push({
      id: 'internal-error',
      title: t('recordingErrorTitle'),
      details: [errorMessage.value],
      tone: 'error',
      copyText: errorMessage.value,
    });
  }
  for (const [id, message] of [
    ['preset', presetError.value],
    ['popover', popoverViewport.error.value],
  ] as const) {
    if (message)
      rows.push({
        id,
        title: t('issues'),
        details: [message],
        tone: 'error',
        copyText: message,
      });
  }
  return rows;
});
const captureDisabled = computed(
  () => isBusy.value || choosingSource.value || isRecording.value || interactionAccess.requesting.value,
);
const embeddedTarget = ref<HudCaptureTarget>('screen');
watch(
  () => props.embeddedCaptureMode,
  (mode) => {
    if (props.embedded && mode) captureMode.value = mode;
  },
  { immediate: true },
);
const changeMode = (mode: CaptureMode) => {
  emit('focus-feature', 'tabs');
  emit('update:capture-mode', mode);
};
const togglePopover = (opened: boolean) => {
  handleDropdownToggle(opened);
  emit('popover-toggle', activeDropdowns.value > 0);
};
onBeforeUnmount(() => emit('popover-toggle', false));
const choose = (target: HudCaptureTarget) => {
  emit('focus-feature', 'source');
  if (props.embedded) {
    embeddedTarget.value = target;
    emit('focus-feature', target);
  }
  if (!props.embedded)
    void chooseCapture(target).catch((reason) => {
      presetError.value = reason instanceof Error ? reason.message : String(reason);
    });
};
</script>

<template>
  <div
    class="hud-wrapper"
    :class="{
      embedded,
      'region-selection-leaving': isRegionSelectionLeaving,
      'region-selection-entering': isRegionSelectionEntering,
    }"
    :style="{ height: `${hudHeight}px` }"
  >
    <TopbarHUD
      v-if="!preparingEditor && (!embedded || showTopbar)"
      :title="preparingEditor ? t('preparingEditor') : undefined"
      :disabled="isBusy || preparingEditor"
      :show-settings="!preparingEditor"
      :show-projects="!preparingEditor"
      @popover-toggle="togglePopover"
      @open-settings="
        openPanel('settings');
        emit('focus-feature', 'topbar');
      "
      @open-projects="
        openPanel('projects');
        emit('focus-feature', 'projects');
      "
      @minimize="minimizeApp"
      @close="closeApp"
    >
      <template #issues>
        <HudIssuesPopover :count="issues.length" @toggle="togglePopover">
          <HudIssue v-for="issue in issues" :key="issue.id" :issue="issue" @action="handleHudIssueAction">
            <template v-if="issue.id === 'interaction-access'" #action>
              <InteractionAccessControl
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
        </HudIssuesPopover>
      </template>
    </TopbarHUD>
    <EditorPreparingHud
      v-if="preparingEditor"
      :progress="editorLoadingProgress"
      @cancel="emit('cancel-editor-opening')"
    />
    <div v-else class="hud-body">
      <div class="hud-layout">
        <section class="capture-section">
          <CaptureModeGroup
            v-model="captureMode"
            class="hud-modes"
            full
            labels
            stacked
            :disabled="isBusy || choosingSource || Boolean(recorderLauncherContext)"
            @update:model-value="changeMode"
          />
          <HudCaptureCards
            :selected="embedded ? embeddedTarget : captureTarget"
            :disabled="captureDisabled"
            @choose="choose"
          />
        </section>
        <aside class="hud-devices" :class="{ instant: captureMode === 'instant' }">
          <template v-if="captureMode !== 'screenshot'">
            <Select
              size="compact"
              :option-height="28"
              @toggle="
                (opened) => {
                  togglePopover(opened);
                  if (opened) emit('focus-feature', 'camera');
                }
              "
              v-model="selectedCameraId"
              :options="cameraOptions"
              :label="t('camera')"
              tooltip-disabled
              :disabled="captureDisabled"
              @update:model-value="emit('focus-feature', 'camera')"
            >
              <template #icon
                ><component
                  :is="selectedCameraId === 'off' ? CameraOff : Camera"
                  :size="14"
                  :class="{ 'is-unavailable': selectedCameraId === 'off' }"
              /></template>
            </Select>
            <Select
              size="compact"
              :option-height="28"
              @toggle="
                (opened) => {
                  togglePopover(opened);
                  if (opened) emit('focus-feature', 'mic');
                }
              "
              v-model="selectedMicId"
              :options="micOptions"
              :label="t('microphone')"
              tooltip-disabled
              :disabled="captureDisabled"
              @update:model-value="emit('focus-feature', 'mic')"
            >
              <template #icon
                ><AudioIconMeter
                  kind="mic"
                  :enabled="selectedMicId !== 'no-audio'"
                  :level="micLevel"
                  :style="{ width: '14px', height: '14px' }"
              /></template>
            </Select>
            <Select
              size="compact"
              :option-height="28"
              @toggle="
                (opened) => {
                  togglePopover(opened);
                  if (opened) emit('focus-feature', 'systemAudio');
                }
              "
              v-model="systemAudioMode"
              :options="systemAudioOptions"
              :label="t('systemAudio')"
              tooltip-disabled
              :disabled="captureDisabled"
              @update:model-value="emit('focus-feature', 'systemAudio')"
            >
              <template #icon
                ><AudioIconMeter
                  kind="system"
                  :enabled="systemAudioMode === 'on'"
                  :level="systemAudioLevel"
                  :style="{ width: '14px', height: '14px' }"
              /></template>
            </Select>
            <div class="device-spacer" />
            <CapturePresetSelect
              v-if="captureMode === 'instant'"
              kind="video"
              compact
              @toggle="togglePopover"
              @error="presetError = $event"
              :disabled="captureDisabled"
            />
            <Button
              variant="secondary"
              size="sm"
              block
              :icon="ScrollText"
              class="teleprompter-button"
              :class="{ active: isTeleprompterVisible }"
              :aria-pressed="isTeleprompterVisible"
              :disabled="isBusy || choosingSource"
              @click="
                toggleTeleprompter();
                emit('focus-feature', 'teleprompter');
              "
              >{{ t('teleprompter') }}</Button
            >
          </template>
          <template v-else>
            <p class="mode-description">{{ t('screenshotDescription') }}</p>
            <div class="device-spacer" />
            <div class="mode-shortcut">
              <span>{{ t('quickSnip') }}</span
              ><KeyboardChip :shortcut="modeShortcut" />
            </div>
          </template>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped src="./hud-shell.css"></style>
