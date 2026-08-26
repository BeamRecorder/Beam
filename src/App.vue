<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import HUD from './components/hud/HUD.vue';
import ToastProvider from './components/ui/toast/ToastProvider.vue';
import Button from './components/ui/button/Button.vue';
import RecorderBar from './components/hud/recorder/RecorderBar.vue';
import CountdownOverlay from './components/hud/recorder/CountdownOverlay.vue';
import ScreenRegionOverlayApp from './components/hud/region/ScreenRegionOverlayApp.vue';
import { useRecordingController } from './components/hud/recorder/useRecordingController';
import type {
  RecordingBarVisibility,
  RecordingConfiguration,
  RecordingSessionResult,
  RecordingStartFailure,
} from './components/hud/recorder/recording-types';
import { formatRecordingStartFailure } from './components/hud/recorder/recording-types';

import { capture } from './api/capture';
import { useLocaleStore } from './stores/locale';
import { useTranslate } from './i18n/useTranslate';
import type { CaptureProject } from './api/types/capture-api';
import type { EditorLoadingProgress } from './api/types/editor-window';

const INTERACTIVE_SELECTORS =
  '.hud-wrapper, .recorder-bar, .camera-overlay-container, .camera-settings-popover, button, a, input, select, textarea, [role="button"], [tabindex], label, video, .popover-content, .popover-trigger, .action-menu-content';
let lastInteractive: boolean | null = null;
let removeEditorRecordingListener: (() => void) | null = null;
let removeEditorLoadingListener: (() => void) | null = null;
let removeTrayStopListener: (() => void) | null = null;
let removeRecordingShortcutListener: (() => void) | null = null;

const handleMouseMove = (e: MouseEvent) => {
  if (currentView.value !== 'hud' && recording.phase.value === 'idle') return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const isInteractive =
    el != null && el !== document.documentElement && el !== document.body && el.closest(INTERACTIVE_SELECTORS) != null;
  if (isInteractive !== lastInteractive) {
    lastInteractive = isInteractive;
    capture.setInteractive(isInteractive);
  }
};

const handleMouseLeave = () => {
  if (lastInteractive !== false) {
    lastInteractive = false;
    capture.setInteractive(false);
  }
};

const localeStore = useLocaleStore();
const { t: tHud } = useTranslate('HUD');
const { t: tRecorderBar } = useTranslate('RecorderBar');

const syncTrayMenu = () => {
  if (
    isCameraOverlay ||
    isCountdownOverlay ||
    isScreenRegionOverlay ||
    isTeleprompter ||
    isQuickSnipCrop ||
    isQuickSnipStatus
  )
    return;
  capture.updateTrayMenu?.({
    openHud: tHud('openHud'),
    stopRecording: tRecorderBar('stopRecording'),
    quit: tHud('quit'),
    tooltip: 'Beam',
    quickSnip: tHud('quickSnip'),
    startQuickSnip: tHud('startQuickSnip'),
    stopQuickSnip: tHud('stopQuickSnip'),
    recording: ['countdown', 'starting', 'recording', 'paused'].includes(recording.phase.value),
  });
};

watch(
  () => localeStore.locale,
  () => {
    void nextTick(() => syncTrayMenu());
  },
  { immediate: true },
);
const logEditor = (message: string, details?: unknown) => {
  if (!import.meta.env.DEV) return;
  if (details === undefined) console.log(`[Beam editor] ${message}`);
  else console.log(`[Beam editor] ${message}`, details);
};
onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove, { passive: true });
  window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
  void capture.getPreferences().then((preferences) => {
    recordingBarVisibility.value = preferences.recordingBar.visibility;
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseleave', handleMouseLeave);
  removeEditorRecordingListener?.();
  removeEditorLoadingListener?.();
  removeTrayStopListener?.();
  removeRecordingShortcutListener?.();
});

const currentView = ref<'hud' | 'recorder'>('hud');
const isCameraOverlay = new URLSearchParams(window.location.search).has('cameraOverlay');
const isCountdownOverlay = new URLSearchParams(window.location.search).has('countdown');
const isScreenRegionOverlay = new URLSearchParams(window.location.search).has('screenRegion');
const isQuickSnipCrop = new URLSearchParams(window.location.search).has('quickSnipCrop');
const isQuickSnipStatus = new URLSearchParams(window.location.search).has('quickSnipStatus');
const isTeleprompter = new URLSearchParams(window.location.search).has('teleprompter');
const CameraOverlayApp = defineAsyncComponent(() => import('./components/hud/camera/CameraOverlayApp.vue'));
const QuickSnipCropBar = defineAsyncComponent(() => import('./components/quick-snip/QuickSnipCropBar.vue'));
const QuickSnipStatus = defineAsyncComponent(() => import('./components/quick-snip/QuickSnipStatus.vue'));
const TeleprompterWindowApp = defineAsyncComponent(
  () => import('./components/hud/teleprompter/TeleprompterWindowApp.vue'),
);
const currentProject = ref<CaptureProject | null>(null);
const isPreparingEditor = ref(false);
const editorLoadError = ref('');
const editorLoadingProgress = ref<EditorLoadingProgress>({ stage: 'openingWindow', value: 10 });

const recordingBarVisibility = ref<RecordingBarVisibility>('always');
const recordingStartupError = ref('');
const recording = useRecordingController(
  (session) => {
    void handleStopRecording(session);
  },
  (failure) => {
    handleRecordingStartupFailure(failure);
  },
);

const returnToHud = () => {
  if (currentView.value !== 'recorder') return;
  capture.hideScreenRegionOverlay();
  void capture.setCountdown(null);
  capture.setCameraOverlayActive(true);
  capture.showHud();
  currentView.value = 'hud';
};

const handleRecordingStartupFailure = (failure: RecordingStartFailure) => {
  recordingStartupError.value = formatRecordingStartFailure(failure);
  returnToHud();
};

watch(
  recording.phase,
  (phase) => {
    syncTrayMenu();
    if (
      !isCameraOverlay &&
      !isCountdownOverlay &&
      !isScreenRegionOverlay &&
      !isTeleprompter &&
      !isQuickSnipCrop &&
      !isQuickSnipStatus
    ) {
      capture.setNormalRecordingActive(['countdown', 'starting', 'recording', 'paused', 'finalizing'].includes(phase));
    }
    // Guarantee the recorder view never coexists with the idle phase, even if
    // the failure callback above is bypassed or throws.
    if (phase === 'idle') returnToHud();
  },
  { immediate: true },
);

watch(currentView, (view) => {
  if (view !== 'hud') return;
  lastInteractive = null;
});

const isRecordingStartedFromEditor = ref(false);

const startRecordingFromEditor = async (configuration: RecordingConfiguration) => {
  isRecordingStartedFromEditor.value = true;
  editorLoadError.value = '';
  recordingStartupError.value = '';
  recordingBarVisibility.value = configuration.recordingBarVisibility;
  currentView.value = 'recorder';
  capture.setWindowMode('recorder');
  capture.setWindowVisible(true);
  capture.setCameraOverlayActive(true);
  await recording.start(configuration);
  if (recording.phase.value === 'idle') returnToHud();
};

onMounted(() => {
  removeEditorRecordingListener = capture.onStartRecordingFromEditor((configuration) => {
    void startRecordingFromEditor(configuration);
  });
  removeEditorLoadingListener = capture.onEditorLoadingProgress((progress) => {
    if (isPreparingEditor.value) editorLoadingProgress.value = progress;
  });
  removeTrayStopListener =
    capture.onTrayStopRecording?.(() => {
      void cancelOrStopRecording();
    }) ?? null;
  removeRecordingShortcutListener = capture.onPreferenceShortcut((actionId) => {
    if (actionId !== 'hud.startStopRecording') return;
    if (!['countdown', 'starting', 'recording', 'paused'].includes(recording.phase.value)) return;
    void cancelOrStopRecording();
  });
});

const startRecording = async (configuration: RecordingConfiguration) => {
  isRecordingStartedFromEditor.value = false;
  editorLoadError.value = '';
  currentProject.value = null;
  recordingStartupError.value = '';
  recordingBarVisibility.value = configuration.recordingBarVisibility;
  currentView.value = 'recorder';
  capture.setWindowMode('recorder');
  capture.setCameraOverlayActive(true);
  await recording.start(configuration);
  if (recording.phase.value === 'idle') returnToHud();
};

const cancelOrStopRecording = async () => {
  const wasStartup = recording.phase.value === 'countdown' || recording.phase.value === 'starting';
  if (!wasStartup) capture.setCameraOverlayActive(false);
  await recording.stop();
  if (!wasStartup && recording.phase.value !== 'idle') capture.setCameraOverlayActive(true);
  if (wasStartup) returnToHud();
};

const cancelRecording = async () => {
  await recording.cancel();
  if (recording.phase.value !== 'idle') return;
  returnToHud();
};

const revealEditor = () => {
  logEditor('Preparing native editor window', {
    projectId: currentProject.value?.id,
  });
  capture.hideTeleprompter?.();
  capture.setCameraOverlayActive(false);
  const projectId = currentProject.value?.id;
  if (!projectId) throw new Error('No project selected');
  return capture.openEditor(projectId).then(() => {
    isPreparingEditor.value = false;
    currentView.value = 'hud';
  });
};

const handleStopRecording = async (session: RecordingSessionResult) => {
  logEditor('Recording finished; loading editor data', { videoSrc: session?.videoSrc });
  const launchedFromEditor = isRecordingStartedFromEditor.value;
  isRecordingStartedFromEditor.value = false;
  capture.setCameraOverlayActive(false);
  editorLoadError.value = '';
  isPreparingEditor.value = true;
  editorLoadingProgress.value = { stage: 'openingWindow', value: 10 };
  currentView.value = 'hud';
  capture.showHud();
  try {
    const projects = await capture.listProjects();
    let targetProject = projects.find((project) => project.previewSrc === session?.videoSrc) ?? projects[0] ?? null;

    if (targetProject && launchedFromEditor) {
      const baseName = targetProject.name || `Project ${targetProject.id.slice(0, 8)}`;
      if (!baseName.startsWith('DEBUG ')) {
        try {
          targetProject = await capture.renameProject(targetProject.id, `DEBUG ${baseName}`);
        } catch (renameErr) {
          console.error('Failed to rename project with DEBUG prefix:', renameErr);
        }
      }
    }

    currentProject.value = targetProject;
    logEditor('Recording project resolved', { projectId: currentProject.value?.id });
  } catch {
    logEditor('Recording editor data load failed');
    currentProject.value = null;
  }
  if (currentProject.value) await revealEditor();
  else {
    isPreparingEditor.value = false;
    editorLoadError.value = 'No recorded project was found';
    capture.showHud();
  }
};

const handleOpenProject = (project: CaptureProject) => {
  logEditor('Project open requested', { projectId: project.id });
  if (isPreparingEditor.value) return;
  isPreparingEditor.value = true;
  editorLoadingProgress.value = { stage: 'openingWindow', value: 10 };
  editorLoadError.value = '';
  currentProject.value = project;
  void revealEditor().catch((error) => {
    logEditor('Project editor data load failed', error);
    if (currentProject.value?.id !== project.id) return;
    isPreparingEditor.value = false;
    editorLoadError.value = error instanceof Error ? error.message : String(error);
    capture.showHud();
    console.error('Failed to load project editor data:', error);
  });
};

const dismissEditorLoadError = () => {
  editorLoadError.value = '';
};
</script>

<template>
  <TeleprompterWindowApp v-if="isTeleprompter" />
  <template v-else>
    <ToastProvider />
    <CameraOverlayApp v-if="isCameraOverlay" />
    <CountdownOverlay v-else-if="isCountdownOverlay" />
    <ScreenRegionOverlayApp v-else-if="isScreenRegionOverlay" />
    <QuickSnipCropBar v-else-if="isQuickSnipCrop" />
    <QuickSnipStatus v-else-if="isQuickSnipStatus" />
  </template>
  <div
    v-if="
      !isTeleprompter &&
      !isCameraOverlay &&
      !isCountdownOverlay &&
      !isScreenRegionOverlay &&
      !isQuickSnipCrop &&
      !isQuickSnipStatus
    "
    class="app-container"
  >
    <HUD
      v-if="currentView === 'hud' && !editorLoadError"
      :preparing-editor="isPreparingEditor"
      :editor-loading-progress="editorLoadingProgress"
      :external-error="recordingStartupError"
      @start-recording="startRecording"
      @open-project="handleOpenProject"
    />
    <Transition name="recorder-return">
      <RecorderBar
        v-if="currentView === 'recorder'"
        :phase="recording.phase.value"
        :seconds-remaining="recording.secondsRemaining.value"
        :recording-time="recording.recordingTime.value"
        :camera-enabled="recording.cameraEnabled.value"
        :microphone-enabled="recording.microphoneEnabled.value"
        :system-audio-enabled="recording.systemAudioEnabled.value"
        :system-audio-level="recording.systemAudioLevel.value"
        :visibility="recordingBarVisibility"
        :hover-only-active="recording.recorderHoverOnlyActive.value"
        @stop="cancelOrStopRecording"
        @cancel="cancelRecording"
        @pause="recording.togglePause"
        @camera="recording.toggleCamera"
        @microphone="recording.toggleMicrophone"
        @system-audio="recording.toggleSystemAudio"
      />
    </Transition>
    <section v-if="editorLoadError" class="editor-load-error" role="alert">
      <p class="editor-load-error-title">Unable to open this project</p>
      <p>{{ editorLoadError }}</p>
      <Button variant="secondary" size="sm" @click="dismissEditorLoadError">Back to projects</Button>
    </section>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: hidden;
}
.editor-load-error {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  background: var(--color-bg-surface);
  color: var(--text-primary);
  text-align: center;
}
.editor-load-error-title {
  font-weight: 700;
}
.recorder-return-enter-active,
.recorder-return-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.recorder-return-enter-from,
.recorder-return-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
</style>

<style>
body.app-minimizing {
  animation: minimizeShrink 0.16s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes minimizeShrink {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  100% {
    opacity: 0.15;
    transform: scale(0.93) translateY(24px);
  }
}
</style>
