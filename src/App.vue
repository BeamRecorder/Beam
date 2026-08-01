<script setup lang="ts">
import {
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { LoaderCircle } from "@lucide/vue";
import HUD from "./components/hud/HUD.vue";
import ToastProvider from "./components/ui/toast/ToastProvider.vue";
import Button from "./components/ui/button/Button.vue";
import RecorderBar from "./components/hud/recorder/RecorderBar.vue";
import CountdownOverlay from "./components/hud/recorder/CountdownOverlay.vue";
import ScreenRegionOverlayApp from "./components/hud/region/ScreenRegionOverlayApp.vue";
import { useRecordingController } from "./components/hud/recorder/useRecordingController";
import type {
  RecordingConfiguration,
  RecordingSessionResult,
} from "./components/hud/recorder/recording-types";

import { capture } from "./api/capture";
import type {
  CaptureProject,
  ProjectEditorData,
} from "./api/types/capture-api";

const INTERACTIVE_SELECTORS =
  '.hud-wrapper, .recorder-bar, .camera-overlay-container, .camera-settings-popover, button, a, input, select, textarea, [role="button"], [tabindex], label, video, .popover-content, .popover-trigger, .action-menu-content';
let lastInteractive: boolean | null = null;

const handleMouseMove = (e: MouseEvent) => {
  if (currentView.value !== "hud" && recording.phase.value === "idle") return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const isInteractive =
    el != null &&
    el !== document.documentElement &&
    el !== document.body &&
    el.closest(INTERACTIVE_SELECTORS) != null;
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

onMounted(() => {
  window.addEventListener("mousemove", handleMouseMove, { passive: true });
  window.addEventListener("mouseleave", handleMouseLeave, { passive: true });
  void capture.getPreferences().then((preferences) => {
    recordingBarVisibility.value = preferences.recordingBar.visibility;
  });
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseleave", handleMouseLeave);
});

const currentView = ref<"hud" | "recorder" | "editor">("hud");
const isCameraOverlay = new URLSearchParams(window.location.search).has(
  "cameraOverlay",
);
const isCountdownOverlay = new URLSearchParams(window.location.search).has(
  "countdown",
);
const isScreenRegionOverlay = new URLSearchParams(window.location.search).has(
  "screenRegion",
);
const isTeleprompter = new URLSearchParams(window.location.search).has(
  "teleprompter",
);
const CameraOverlayApp = defineAsyncComponent(
  () => import("./components/hud/camera/CameraOverlayApp.vue"),
);
const VideoEditor = defineAsyncComponent(
  () => import("./components/video-editor/VideoEditor.vue"),
);
const TeleprompterWindowApp = defineAsyncComponent(
  () => import("./components/hud/teleprompter/TeleprompterWindowApp.vue"),
);
const currentVideoSrc = ref<string | null>(null);
const currentProject = ref<CaptureProject | null>(null);
const currentEditorData = ref<ProjectEditorData | null>(null);
const isPreparingEditor = ref(false);
const editorLoadError = ref("");
const EDITOR_WINDOW_SIZE = { width: 1280, height: 800 };

const isExitingEditor = ref(false);

const setView = (view: "hud" | "editor") => {
  if (view === "hud" && currentView.value === "editor") {
    isExitingEditor.value = true;
    setTimeout(() => {
      currentView.value = "hud";
      isExitingEditor.value = false;
      capture.setCameraOverlayActive(true);
      capture.showHud();
    }, 180);
  } else {
    currentView.value = view;
    if (view === "editor") {
      capture.setCameraOverlayActive(false);
      capture.setWindowMode("editor");
      capture.setSize(EDITOR_WINDOW_SIZE.width, EDITOR_WINDOW_SIZE.height);
    }
  }
};

const recordingBarVisibility = ref<"always" | "auto-fade">("always");
const recording = useRecordingController((session) => {
  void handleStopRecording(session);
});

watch(currentView, (view) => {
  if (view !== "hud") return;
  lastInteractive = null;
});

const isRecordingStartedFromEditor = ref(false);

const startRecordingFromEditor = async (configuration: RecordingConfiguration) => {
  isRecordingStartedFromEditor.value = true;
  editorLoadError.value = "";
  recordingBarVisibility.value = configuration.recordingBarVisibility;
  capture.setCameraOverlayActive(true);
  await recording.start(configuration);
};

const startRecording = async (configuration: RecordingConfiguration) => {
  isRecordingStartedFromEditor.value = false;
  editorLoadError.value = "";
  currentVideoSrc.value = null;
  currentProject.value = null;
  currentEditorData.value = null;
  recordingBarVisibility.value = configuration.recordingBarVisibility;
  currentView.value = "recorder";
  capture.setWindowMode("recorder");
  capture.setCameraOverlayActive(true);
  await recording.start(configuration);
  if (recording.phase.value === "idle") {
    currentView.value = "hud";
    capture.setCameraOverlayActive(true);
    capture.showHud();
  }
};

const cancelOrStopRecording = async () => {
  const wasCountdown = recording.phase.value === "countdown";
  await recording.stop();
  if (wasCountdown && currentView.value === "recorder") {
    capture.setWindowMode("hud");
    capture.setSize(352, 512);
    currentView.value = "hud";
  }
};

const cancelRecording = async () => {
  await recording.cancel();
  if (recording.phase.value !== "idle") return;
  if (currentView.value === "recorder") {
    capture.setWindowMode("hud");
    capture.setSize(352, 512);
    currentView.value = "hud";
    capture.setCameraOverlayActive(true);
    capture.showHud();
  }
};

const revealEditor = async () => {
  capture.hideTeleprompter?.();
  // Keep the HUD/recorder window click-through while the editor transition is
  // still in progress. It is shown again only after the editor is mounted.
  capture.setWindowVisible?.(false);
  capture.setCameraOverlayActive(false);
  capture.setWindowMode("editor");
  capture.setSize(EDITOR_WINDOW_SIZE.width, EDITOR_WINDOW_SIZE.height);
  currentView.value = "editor";
  isPreparingEditor.value = false;
  await nextTick();
  capture.present();
};

const handleStopRecording = async (session: RecordingSessionResult) => {
  const launchedFromEditor = isRecordingStartedFromEditor.value;
  isRecordingStartedFromEditor.value = false;
  capture.setWindowVisible?.(false);
  editorLoadError.value = "";
  isPreparingEditor.value = true;
  if (session && session.videoSrc) currentVideoSrc.value = session.videoSrc;
  try {
    const projects = await capture.listProjects();
    let targetProject =
      projects.find((project) => project.previewSrc === session?.videoSrc) ??
      projects[0] ??
      null;

    if (targetProject && launchedFromEditor) {
      const baseName = targetProject.name || `Project ${targetProject.id.slice(0, 8)}`;
      if (!baseName.startsWith("DEBUG ")) {
        try {
          targetProject = await capture.renameProject(
            targetProject.id,
            `DEBUG ${baseName}`
          );
        } catch (renameErr) {
          console.error("Failed to rename project with DEBUG prefix:", renameErr);
        }
      }
    }

    currentProject.value = targetProject;
    currentEditorData.value = currentProject.value
      ? await capture.getProjectEditorData(currentProject.value.id)
      : null;
  } catch {
    currentProject.value = null;
    currentEditorData.value = null;
  }
  await revealEditor();
};

const handleOpenProject = (project: CaptureProject) => {
  capture.setWindowVisible?.(false);
  isPreparingEditor.value = true;
  editorLoadError.value = "";
  currentProject.value = project;
  currentVideoSrc.value = project.previewSrc;
  currentEditorData.value = null;
  void capture
    .getProjectEditorData(project.id)
    .then(async (data) => {
      if (currentProject.value?.id !== project.id) return;
      currentEditorData.value = data;
      await revealEditor();
    })
    .catch((error) => {
      isPreparingEditor.value = false;
      editorLoadError.value =
        error instanceof Error ? error.message : String(error);
      capture.setWindowMode("hud");
      capture.setWindowVisible?.(true);
      capture.showHud();
      console.error("Failed to load project editor data:", error);
    });
};

const dismissEditorLoadError = () => {
  editorLoadError.value = "";
};
</script>

<template>
  <TeleprompterWindowApp v-if="isTeleprompter" />
  <template v-else>
    <ToastProvider />
    <CameraOverlayApp v-if="isCameraOverlay" />
    <CountdownOverlay v-else-if="isCountdownOverlay" />
    <ScreenRegionOverlayApp v-else-if="isScreenRegionOverlay" />
  </template>
  <div v-if="!isTeleprompter && !isCameraOverlay && !isCountdownOverlay && !isScreenRegionOverlay" class="app-container">
    <HUD
      v-if="currentView === 'hud' && !isPreparingEditor && !editorLoadError"
      @start-recording="startRecording"
      @open-project="handleOpenProject"
    />
    <Transition name="recorder-return">
      <RecorderBar
        v-if="currentView === 'recorder' || (currentView === 'editor' && recording.phase.value !== 'idle')"
        :phase="recording.phase.value"
        :seconds-remaining="recording.secondsRemaining.value"
        :recording-time="recording.recordingTime.value"
        :camera-enabled="recording.cameraEnabled.value"
        :microphone-enabled="recording.microphoneEnabled.value"
        :system-audio-enabled="recording.systemAudioEnabled.value"
        :visibility="recordingBarVisibility"
        @stop="cancelOrStopRecording"
        @cancel="cancelRecording"
        @pause="recording.togglePause"
        @camera="recording.toggleCamera"
        @microphone="recording.toggleMicrophone"
        @system-audio="recording.toggleSystemAudio"
      />
    </Transition>
    <section
      v-if="isPreparingEditor"
      class="editor-preparing"
      aria-live="polite"
    >
      <LoaderCircle class="preparing-spinner" :size="28" />
      <div>
        <p class="preparing-title">Preparing your editor</p>
        <p class="preparing-copy">
          Finalizing recording and loading your timeline…
        </p>
      </div>
    </section>
    <section v-else-if="editorLoadError" class="editor-load-error" role="alert">
      <p class="editor-load-error-title">Unable to open this project</p>
      <p>{{ editorLoadError }}</p>
      <Button variant="secondary" size="sm" @click="dismissEditorLoadError"
        >Back to projects</Button
      >
    </section>
    <Transition name="editor-reveal">
      <VideoEditor
        v-if="currentView === 'editor' && !isPreparingEditor"
        :class="{ 'exiting-editor': isExitingEditor }"
        :video-src="currentVideoSrc"
        :editor-data="currentEditorData"
        :project="currentProject"
        @back-to-hud="setView('hud')"
        @open-project="handleOpenProject"
        @start-recording="startRecordingFromEditor"
      />
    </Transition>
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
.editor-preparing {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--color-bg-surface);
  color: var(--text-primary);
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
.editor-load-error-title,
.preparing-title {
  font-weight: 700;
}
.preparing-spinner {
  color: var(--color-primary);
  animation: spin 0.85s linear infinite;
}
.preparing-copy {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 13px;
}
.editor-reveal-enter-active,
.editor-reveal-leave-active {
  transition:
    opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.editor-reveal-enter-from,
.editor-reveal-leave-to {
  opacity: 0;
  transform: scale(0.98) translateY(6px);
}
.exiting-editor {
  opacity: 0;
  transform: scale(0.96) translateY(12px);
  transition:
    opacity 0.18s ease-out,
    transform 0.18s ease-out;
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
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
