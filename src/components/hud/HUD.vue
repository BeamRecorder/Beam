<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { capture } from "../../api/capture";
import {
  BrowserCameraRecorder,
  listBrowserCameras,
} from "../../api/camera-recorder";
import {
  BrowserMicrophoneRecorder,
  listBrowserMicrophones,
  recordMicrophoneFailure,
} from "../../api/microphone-recorder";
import {
  BrowserSystemAudioRecorder,
  recordSystemAudioFailure,
  systemAudioSource,
} from "../../api/system-audio-recorder";
import type {
  CaptureCatalog,
  CapturePreview,
  CaptureProject,
  CaptureSession,
  CaptureSource,
} from "../../api/types/capture-api";
import Button from "~/ui/button/Button.vue";
import Select from "~/ui/select/Select.vue";
import ButtonGroup from "~/ui/button/ButtonGroup.vue";
import WindowSelect from "~/ui/select/WindowSelect.vue";
import Skeleton from "~/ui/skeleton/Skeleton.vue";
import TopbarHUD from "./TopbarHUD.vue";
import {
  Monitor,
  Layout,
  ArrowUpRight,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Copy,
  Check,
} from "@lucide/vue";

import CameraPreviewOverlay from "./CameraPreviewOverlay.vue";

const STORAGE_KEY_DEVICES = "demorecorder_hud_devices";
const STORAGE_KEY_CAM_STYLE = "demorecorder_hud_camera_style";

const savedDevices = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEVICES);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const savedCamStyle = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CAM_STYLE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const emit = defineEmits(["start-recording", "stop-recording", "open-project"]);
const ProjectPicker = defineAsyncComponent(() => import("./ProjectPicker.vue"));
const HudPreferences = defineAsyncComponent(
  () => import("./HudPreferences.vue"),
);

// Window state
const activeTab = ref<"screen" | "window">("screen");
const isRecording = ref(false);
const isBusy = ref(false);
const errorMessage = ref("");
const copiedError = ref(false);
let copiedErrorTimeout: ReturnType<typeof setTimeout> | null = null;
const sources = ref<CaptureSource[]>([]);

// View State (Main vs Settings)
const showSettings = ref(false);
const showProjectPicker = ref(false);

// Preference settings
const recordHighQuality = ref(true);
const countdownSeconds = ref(3); // 0 for Off, 3, 5, 10

// Camera Overlay styling options
const cameraShadowSize = ref<string>(savedCamStyle?.shadowSize ?? "lg");
const cameraCornerRadius = ref<string>(savedCamStyle?.cornerRadius ?? "lg");
const cameraSize = ref<string>(savedCamStyle?.size ?? "md");

watch([cameraShadowSize, cameraCornerRadius, cameraSize], () => {
  try {
    localStorage.setItem(
      STORAGE_KEY_CAM_STYLE,
      JSON.stringify({
        shadowSize: cameraShadowSize.value,
        cornerRadius: cameraCornerRadius.value,
        size: cameraSize.value,
      }),
    );
  } catch (err) {
    console.error("Failed to save camera styling preferences:", err);
  }
});

// Previews
const previews = ref<CapturePreview[]>([]);
const selectedSourceId = ref<string | null>(null);

// Sources lists (Camera / Microphone)
const cameraOptions = computed(() => [
  ...sources.value
    .filter((source) => source.kind === "camera")
    .map((source) => ({ value: source.id, label: source.label })),
  { value: "off", label: "Camera Off" },
]);
const selectedCameraId = ref(savedDevices?.cameraId ?? "off");

const micOptions = computed(() => [
  ...sources.value
    .filter((source) => source.kind === "microphone")
    .map((source) => ({ value: source.id, label: source.label })),
  { value: "no-audio", label: "No Audio" },
]);
const selectedMicId = ref(savedDevices?.micId ?? "no-audio");
const selectedScreenId = ref<string | null>(null);
const systemAudioMode = ref<"on" | "off">(
  savedDevices?.systemAudioMode ?? "off",
);

watch([selectedCameraId, selectedMicId, systemAudioMode], () => {
  try {
    localStorage.setItem(
      STORAGE_KEY_DEVICES,
      JSON.stringify({
        cameraId: selectedCameraId.value,
        micId: selectedMicId.value,
        systemAudioMode: systemAudioMode.value,
      }),
    );
  } catch (err) {
    console.error("Failed to save HUD device preferences:", err);
  }
});
const screenOptions = computed(() =>
  sources.value
    .filter((source) => source.kind === "display")
    .map((source, index) => ({
      value: source.id,
      label: `Screen ${index + 1}`,
    })),
);
const systemAudioOptions = [
  { value: "on", label: "System audio" },
  { value: "off", label: "Off" },
];

// Timer / Duration simulation
const recordingTime = ref("00:00");
let timerInterval: ReturnType<typeof setInterval> | null = null;
let previewsRefreshInterval: ReturnType<typeof setInterval> | null = null;
let activeCamera: BrowserCameraRecorder | null = null;
let activeCameraSessionId: string | null = null;
let activeMicrophone: BrowserMicrophoneRecorder | null = null;
let activeMicrophoneSessionId: string | null = null;
let activeSystemAudio: BrowserSystemAudioRecorder | null = null;
let activeSystemAudioSessionId: string | null = null;
const secondsElapsed = ref(0);

const startTimer = () => {
  secondsElapsed.value = 0;
  recordingTime.value = "00:00";
  timerInterval = setInterval(() => {
    secondsElapsed.value++;
    const mins = Math.floor(secondsElapsed.value / 60)
      .toString()
      .padStart(2, "0");
    const secs = (secondsElapsed.value % 60).toString().padStart(2, "0");
    recordingTime.value = `${mins}:${secs}`;
  }, 1000);
};

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
};

// Previews loading
const loadPreviews = async () => {
  try {
    const type = activeTab.value === "screen" ? "screen" : "window";
    const results = await capture.getSources([type]);
    previews.value = results;

    // Auto-select first source if none or invalid is selected
    if (results.length > 0) {
      if (
        !selectedSourceId.value ||
        !results.some((result) => result.id === selectedSourceId.value)
      ) {
        selectedSourceId.value = results[0].id;
      }
    } else {
      selectedSourceId.value = null;
    }
  } catch (err) {
    console.error("Failed to load window/screen previews:", err);
  }
};

const activeDropdowns = ref(0);
let lastHeight = 480;
let lastWidth = 320;

const updateWindowSize = () => {
  const isDropdownOpen = activeDropdowns.value > 0;
  let targetHeight = 480;
  const errorHeight =
    !showSettings.value && !showProjectPicker.value && errorMessage.value
      ? 116
      : 0;
  if (showSettings.value) {
    targetHeight = 520;
  } else if (showProjectPicker.value) {
    targetHeight = 520;
  } else {
    if (activeTab.value === "window") {
      targetHeight = isDropdownOpen ? 660 : 500;
    } else {
      targetHeight = isDropdownOpen ? 640 : 480;
    }
  }

  targetHeight += errorHeight;
  const targetWidth = isDropdownOpen ? 365 : 320;

  if (targetHeight > lastHeight || targetWidth > lastWidth) {
    // Grow the Electron window instantly so transitions are not clipped
    capture.setSize(targetWidth, targetHeight);
  } else if (targetHeight < lastHeight || targetWidth < lastWidth) {
    // Wait for the card's CSS transition (200ms) to complete before shrinking
    const snapshotDropdownOpen = activeDropdowns.value > 0;
    const snapshotHeight = targetHeight;
    const snapshotWidth = targetWidth;
    setTimeout(() => {
      const currentDropdownOpen = activeDropdowns.value > 0;
      let currentTargetHeight = 480;
      const errorHeight =
        !showSettings.value && !showProjectPicker.value && errorMessage.value
          ? 116
          : 0;
      if (showSettings.value) {
        currentTargetHeight = 520;
      } else if (showProjectPicker.value) {
        currentTargetHeight = 520;
      } else {
        if (activeTab.value === "window") {
          currentTargetHeight = currentDropdownOpen ? 660 : 500;
        } else {
          currentTargetHeight = currentDropdownOpen ? 640 : 480;
        }
      }
      currentTargetHeight += errorHeight;
      const currentTargetWidth = currentDropdownOpen ? 365 : 320;

      // Only apply if the situation hasn't changed (don't override a subsequent open)
      if (
        currentDropdownOpen === snapshotDropdownOpen &&
        currentTargetHeight === snapshotHeight &&
        currentTargetWidth === snapshotWidth
      ) {
        capture.setSize(snapshotWidth, snapshotHeight);
      }
    }, 200);
  }
  lastHeight = targetHeight;
  lastWidth = targetWidth;
};

const hudHeight = computed(() => {
  const errorHeight =
    !showSettings.value && !showProjectPicker.value && errorMessage.value
      ? 116
      : 0;
  if (showSettings.value || showProjectPicker.value) {
    return 520 + errorHeight;
  }
  return (activeTab.value === "window" ? 500 : 480) + errorHeight;
});

const handleDropdownToggle = (isOpen: boolean) => {
  if (isOpen) {
    activeDropdowns.value++;
  } else {
    activeDropdowns.value = Math.max(0, activeDropdowns.value - 1);
  }
  updateWindowSize();
};

// Watch tab change to reload previews and resize window
watch(activeTab, () => {
  previews.value = [];
  updateWindowSize();
  void loadPreviews();
});

// Watch settings view toggle to update window size
watch(showSettings, () => {
  updateWindowSize();
});

watch(showProjectPicker, () => {
  updateWindowSize();
});

watch(errorMessage, () => {
  copiedError.value = false;
  updateWindowSize();
});

const copyError = async () => {
  if (!errorMessage.value) return;
  try {
    await navigator.clipboard.writeText(errorMessage.value);
  } catch {
    const text = document.createElement("textarea");
    text.value = errorMessage.value;
    text.setAttribute("readonly", "");
    text.style.position = "fixed";
    text.style.opacity = "0";
    document.body.append(text);
    try {
      text.select();
      if (!document.execCommand("copy"))
        throw new Error("Unable to copy the error.");
    } finally {
      text.remove();
    }
  }
  copiedError.value = true;
  if (copiedErrorTimeout) clearTimeout(copiedErrorTimeout);
  copiedErrorTimeout = setTimeout(() => {
    copiedError.value = false;
  }, 2000);
};

// Control functions
const toggleRecording = async () => {
  if (isBusy.value) return;
  isBusy.value = true;
  errorMessage.value = "";
  try {
    if (!isRecording.value) {
      const systemAudioRequested = systemAudioMode.value === "on";
      let systemAudio: BrowserSystemAudioRecorder | null = null;
      let systemAudioError: Error | null = null;
      if (systemAudioRequested) {
        try {
          systemAudio = await BrowserSystemAudioRecorder.request();
        } catch (error) {
          systemAudioError =
            error instanceof Error
              ? new Error(`${error.name}: ${error.message}`)
              : new Error(String(error));
        }
      }
      const camera =
        selectedCameraId.value === "off"
          ? null
          : await BrowserCameraRecorder.request(selectedCameraId.value);
      const microphoneId =
        selectedMicId.value === "no-audio" ? null : selectedMicId.value;
      let microphone: BrowserMicrophoneRecorder | null = null;
      let microphoneError: Error | null = null;
      if (microphoneId) {
        try {
          microphone = await BrowserMicrophoneRecorder.request(microphoneId);
        } catch (error) {
          microphoneError =
            error instanceof Error ? error : new Error(String(error));
        }
      }
      // Find matching Rust catalog ID for the selected preview source
      let rustScreenId: string | undefined = undefined;
      if (selectedSourceId.value) {
        if (activeTab.value === "window") {
          // Electron window ID: "window:12345"
          const hwndDec = Number(selectedSourceId.value.replace("window:", ""));
          const hwndHex = hwndDec.toString(16).toLowerCase();
          const match = sources.value.find(
            (s) => s.kind === "window" && s.id.toLowerCase().includes(hwndHex),
          );
          rustScreenId = match ? match.id : undefined;
        }
      }

      if (activeTab.value === "screen")
        rustScreenId = selectedScreenId.value ?? undefined;

      let session: CaptureSession | undefined;
      try {
        session = await capture.startRecording({
          screenKind: activeTab.value === "window" ? "window" : "display",
          screenId: rustScreenId,
          microphoneId: null,
          cameraId: camera ? selectedCameraId.value : null,
          systemAudio: false,
          cursor: true,
          targetFps: recordHighQuality.value ? 60 : 30,
        });
        isRecording.value =
          session.state === "recording" || session.state === "degraded";
        if (!isRecording.value)
          throw new Error(`Unexpected state after start: ${session.state}`);
        if (camera) {
          if (!session.sessionId)
            throw new Error(
              "The capture session did not provide an identifier.",
            );
          const cameraSessionId = session.sessionId;
          activeCamera = camera;
          activeCameraSessionId = cameraSessionId;
          camera.onFatal((reason) => {
            void stopForCameraFailure(camera, cameraSessionId, reason);
          });
          await camera.start(cameraSessionId);
        }
        if (session.sessionId && microphone) {
          const microphoneSessionId = session.sessionId;
          activeMicrophone = microphone;
          activeMicrophoneSessionId = microphoneSessionId;
          microphone.onFatal((reason) => {
            void stopForMicrophoneFailure(
              microphone,
              microphoneSessionId,
              reason,
            );
          });
          try {
            await microphone.start(microphoneSessionId);
          } catch (error) {
            await stopForMicrophoneFailure(
              microphone,
              microphoneSessionId,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        } else if (session.sessionId && microphoneId && microphoneError) {
          await recordMicrophoneFailure(
            session.sessionId,
            microphoneId,
            microphoneError.message,
          );
          errorMessage.value = `Microphone recording is unavailable: ${microphoneError.message}`;
        }
        if (session.sessionId && systemAudio) {
          const systemAudioSessionId = session.sessionId;
          activeSystemAudio = systemAudio;
          activeSystemAudioSessionId = systemAudioSessionId;
          systemAudio.onFatal((reason) => {
            void stopForSystemAudioFailure(
              systemAudio,
              systemAudioSessionId,
              reason,
            );
          });
          try {
            await systemAudio.start(systemAudioSessionId);
          } catch (error) {
            await stopForSystemAudioFailure(
              systemAudio,
              systemAudioSessionId,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        } else if (
          session.sessionId &&
          systemAudioRequested &&
          systemAudioError
        ) {
          await recordSystemAudioFailure(
            session.sessionId,
            systemAudioError.message,
          );
          errorMessage.value = `System audio recording is unavailable: ${systemAudioError.message}`;
        }
      } catch (error) {
        if (camera) await camera.stop().catch(() => undefined);
        if (microphone) await microphone.stop().catch(() => undefined);
        if (systemAudio) await systemAudio.stop().catch(() => undefined);
        if (session?.sessionId) await capture.stop().catch(() => undefined);
        activeCamera = null;
        activeCameraSessionId = null;
        activeMicrophone = null;
        activeMicrophoneSessionId = null;
        activeSystemAudio = null;
        activeSystemAudioSessionId = null;
        isRecording.value = false;
        throw error;
      }
      if (!session) throw new Error("The capture session did not start.");
      startTimer();
      emit("start-recording", session);
    } else {
      let cameraStopError: Error | null = null;
      if (activeSystemAudio) {
        try {
          await activeSystemAudio.stop();
        } catch (error) {
          if (activeSystemAudioSessionId)
            await activeSystemAudio.fail(
              activeSystemAudioSessionId,
              error instanceof Error ? error.message : String(error),
            );
          errorMessage.value = `System audio recording failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      if (activeMicrophone) {
        try {
          await activeMicrophone.stop();
        } catch (error) {
          if (activeMicrophoneSessionId)
            await activeMicrophone.fail(
              activeMicrophoneSessionId,
              error instanceof Error ? error.message : String(error),
            );
          errorMessage.value = `Microphone recording failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      if (activeCamera) {
        try {
          await activeCamera.stop();
        } catch (error) {
          cameraStopError =
            error instanceof Error ? error : new Error(String(error));
          if (activeCameraSessionId)
            await activeCamera.fail(
              activeCameraSessionId,
              cameraStopError.message,
            );
        }
      }
      const session = await capture.stop();
      activeCamera = null;
      activeCameraSessionId = null;
      activeMicrophone = null;
      activeMicrophoneSessionId = null;
      activeSystemAudio = null;
      activeSystemAudioSessionId = null;
      stopTimer();
      isRecording.value = false;
      emit("stop-recording", session);
      if (cameraStopError) throw cameraStopError;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isBusy.value = false;
  }
};

const stopForMicrophoneFailure = async (
  microphone: BrowserMicrophoneRecorder,
  sessionId: string,
  reason: Error,
) => {
  if (activeMicrophone !== microphone) return;
  try {
    await microphone.fail(sessionId, reason.message);
    errorMessage.value = `Microphone recording stopped: ${reason.message}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    activeMicrophone = null;
    activeMicrophoneSessionId = null;
  }
};

const stopForSystemAudioFailure = async (
  systemAudio: BrowserSystemAudioRecorder,
  sessionId: string,
  reason: Error,
) => {
  if (activeSystemAudio !== systemAudio) return;
  try {
    await systemAudio.fail(sessionId, reason.message);
    errorMessage.value = `System audio recording stopped: ${reason.message}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    activeSystemAudio = null;
    activeSystemAudioSessionId = null;
  }
};

const stopForCameraFailure = async (
  camera: BrowserCameraRecorder,
  sessionId: string,
  reason: Error,
) => {
  if (activeCamera !== camera || !isRecording.value) return;
  isRecording.value = false;
  isBusy.value = true;
  try {
    await camera.fail(sessionId, reason.message);
    await capture.stop();
    stopTimer();
    activeCamera = null;
    activeCameraSessionId = null;
    errorMessage.value = `Camera recording stopped: ${reason.message}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isBusy.value = false;
  }
};

const discoverSources = async () => {
  isBusy.value = true;
  errorMessage.value = "";
  try {
    const [catalog, cameras, microphones] = (await Promise.all([
      capture.discover(),
      listBrowserCameras(),
      listBrowserMicrophones(),
    ])) as [CaptureCatalog, CaptureSource[], CaptureSource[]];
    sources.value = [
      ...(Array.isArray(catalog.sources) ? catalog.sources : []),
      ...cameras,
      ...microphones,
      systemAudioSource(),
    ];
    const defaultCamera =
      sources.value.find(
        (source) => source.kind === "camera" && source.isDefault,
      ) ?? sources.value.find((source) => source.kind === "camera");
    const defaultMic =
      sources.value.find(
        (source) => source.kind === "microphone" && source.isDefault,
      ) ?? sources.value.find((source) => source.kind === "microphone");

    if (
      savedDevices?.cameraId &&
      (savedDevices.cameraId === "off" ||
        sources.value.some((s) => s.id === savedDevices.cameraId))
    ) {
      selectedCameraId.value = savedDevices.cameraId;
    } else {
      selectedCameraId.value = "off";
    }

    if (
      savedDevices?.micId &&
      (savedDevices.micId === "no-audio" ||
        sources.value.some((s) => s.id === savedDevices.micId))
    ) {
      selectedMicId.value = savedDevices.micId;
    } else {
      selectedMicId.value = "no-audio";
    }

    if (
      savedDevices?.systemAudioMode &&
      (savedDevices.systemAudioMode === "on" ||
        savedDevices.systemAudioMode === "off")
    ) {
      systemAudioMode.value = savedDevices.systemAudioMode;
    } else {
      systemAudioMode.value = "off";
    }

    selectedScreenId.value =
      sources.value.find(
        (source) => source.kind === "display" && source.isDefault,
      )?.id ??
      sources.value.find((source) => source.kind === "display")?.id ??
      null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isBusy.value = false;
  }
};

onMounted(async () => {
  updateWindowSize();
  await discoverSources();
  await loadPreviews();
  // Periodically refresh window previews when settings is not open and not recording
  previewsRefreshInterval = setInterval(() => {
    if (
      !showSettings.value &&
      !isRecording.value &&
      activeTab.value === "window"
    ) {
      void loadPreviews();
    }
  }, 5000);
});

onBeforeUnmount(() => {
  stopTimer();
  void activeCamera?.stop();
  void activeMicrophone?.stop();
  void activeSystemAudio?.stop();
  if (copiedErrorTimeout) clearTimeout(copiedErrorTimeout);
  activeCameraSessionId = null;
  activeMicrophoneSessionId = null;
  activeSystemAudioSessionId = null;
  if (previewsRefreshInterval) clearInterval(previewsRefreshInterval);
});

const closeApp = () => {
  capture.close();
};

const minimizeApp = () => {
  capture.minimize();
};

const openProjectPicker = () => {
  showSettings.value = false;
  showProjectPicker.value = true;
};

const closeProjectPicker = () => {
  showProjectPicker.value = false;
};

const handleTopbarBack = () => {
  if (showProjectPicker.value) {
    closeProjectPicker();
    return;
  }
  showSettings.value = false;
};

const openProject = (project: CaptureProject) => {
  emit("open-project", project);
};
</script>

<template>
  <div
    class="hud-wrapper"
    :class="[
      activeTab,
      { 'settings-open': showSettings, 'dropdown-open': activeDropdowns > 0 },
    ]"
    :style="{ height: `${hudHeight}px` }"
  >
    <TopbarHUD
      :title="
        showProjectPicker
          ? 'Open a project'
          : showSettings
            ? 'Preferences'
            : 'DemoRecorder'
      "
      :show-back="showProjectPicker || showSettings"
      :show-settings="!showSettings && !showProjectPicker"
      :is-recording="isRecording"
      @back="handleTopbarBack"
      @minimize="minimizeApp"
      @open-settings="showSettings = true"
      @close="closeApp"
    />

    <!-- Live Camera Overlay Preview -->
    <Teleport to="body">
      <CameraPreviewOverlay
        v-if="!showSettings && !showProjectPicker"
        v-model:shadow-size="cameraShadowSize"
        v-model:corner-radius="cameraCornerRadius"
        v-model:size="cameraSize"
        :camera-id="selectedCameraId"
        @toggle-popover="handleDropdownToggle"
      />
    </Teleport>

    <Transition name="hud-view" mode="out-in">
      <!-- Project Picker View -->
      <ProjectPicker
        v-if="showProjectPicker"
        key="project-picker"
        @back="closeProjectPicker"
        @open-project="openProject"
        @toggle-popover="handleDropdownToggle"
      />

      <HudPreferences
        v-else-if="showSettings"
        key="settings"
        :record-high-quality="recordHighQuality"
        :countdown-seconds="countdownSeconds"
        @update:record-high-quality="recordHighQuality = $event"
        @update:countdown-seconds="countdownSeconds = $event"
        @close="showSettings = false"
      />

      <!-- Main HUD Form -->
      <div v-else key="hud" class="hud-body">
        <!-- Tabs (Screen / Window) -->
        <ButtonGroup class="mode-tabs">
          <Button
            :class="{ active: activeTab === 'screen' }"
            variant="tab"
            @click="activeTab = 'screen'"
          >
            <template #icon><Monitor class="btn-icon" /></template>
            Screen
          </Button>
          <Button
            :class="{ active: activeTab === 'window' }"
            variant="tab"
            @click="activeTab = 'window'"
          >
            <template #icon><Layout class="btn-icon" /></template>
            Window
          </Button>
        </ButtonGroup>

        <div class="form-inputs-area">
          <Transition name="fade-slide" mode="out-in">
            <div :key="activeTab" class="tab-content-container">
              <!-- Capture source -->
              <template v-if="activeTab === 'window'">
                <div v-if="isBusy && previews.length === 0" class="device-row">
                  <Layout class="device-icon" />
                  <Skeleton
                    variant="linear"
                    height="2.75rem"
                    radius="var(--radius-md)"
                  />
                </div>
                <div v-else class="device-row">
                  <Layout class="device-icon" />
                  <WindowSelect
                    v-model="selectedSourceId"
                    :options="previews"
                    :disabled="isRecording || isBusy"
                    @toggle="handleDropdownToggle"
                  />
                </div>
              </template>

              <div v-else class="device-row">
                <Monitor class="device-icon" />
                <Select
                  v-model="selectedScreenId"
                  :options="screenOptions"
                  :disabled="
                    isRecording || isBusy || screenOptions.length === 0
                  "
                  @toggle="handleDropdownToggle"
                />
              </div>

              <!-- Audio and input devices -->
              <div class="selectors-stack">
                <div class="device-row">
                  <component
                    :is="systemAudioMode === 'off' ? VolumeX : Volume2"
                    class="device-icon"
                    :class="{ 'is-unavailable': systemAudioMode === 'off' }"
                  />
                  <Select
                    v-model="systemAudioMode"
                    :options="systemAudioOptions"
                    :disabled="isRecording || isBusy"
                    @toggle="handleDropdownToggle"
                  />
                </div>

                <div class="device-row">
                  <component
                    :is="selectedMicId === 'no-audio' ? MicOff : Mic"
                    class="device-icon"
                    :class="{ 'is-unavailable': selectedMicId === 'no-audio' }"
                  />
                  <div v-if="isBusy && sources.length === 0">
                    <Skeleton
                      variant="radial"
                      height="2.75rem"
                      radius="var(--radius-md)"
                    />
                  </div>
                  <Select
                    v-else
                    v-model="selectedMicId"
                    :options="micOptions"
                    :disabled="isRecording || isBusy"
                    @toggle="handleDropdownToggle"
                  />
                </div>

                <div class="device-row">
                  <component
                    :is="selectedCameraId === 'off' ? VideoOff : Video"
                    class="device-icon"
                    :class="{ 'is-unavailable': selectedCameraId === 'off' }"
                  />
                  <div v-if="isBusy && sources.length === 0">
                    <Skeleton
                      variant="linear"
                      height="2.75rem"
                      radius="var(--radius-md)"
                    />
                  </div>
                  <Select
                    v-else
                    v-model="selectedCameraId"
                    :options="cameraOptions"
                    :disabled="isRecording || isBusy"
                    @toggle="handleDropdownToggle"
                  />
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <div v-if="errorMessage" class="capture-error" role="alert">
          <p class="capture-error-message">{{ errorMessage }}</p>
          <Button
            variant="ghost"
            size="sm"
            class="capture-error-copy"
            :icon="copiedError ? Check : Copy"
            @click="copyError"
          >
            {{ copiedError ? "Copied" : "Copy error" }}
          </Button>
        </div>

        <!-- Action Button (Centered Capsule) -->
        <div class="action-section">
          <Button
            :variant="isRecording ? 'outline' : 'primary'"
            size="md"
            :block="true"
            class="record-btn-override"
            :class="{ recording: isRecording }"
            :disabled="isBusy"
            @click="toggleRecording"
          >
            <template #icon>
              <span class="pulse-dot" v-if="isRecording"></span>
            </template>
            {{
              isBusy
                ? "Please wait…"
                : isRecording
                  ? `Stop (${recordingTime})`
                  : "Start Recording"
            }}
          </Button>
        </div>

        <!-- Open existing project button (Subtle style) -->
        <div class="web-link-container">
          <Button
            variant="link"
            size="sm"
            class="web-link-text project-btn"
            :icon="ArrowUpRight"
            @click="openProjectPicker"
          >
            Open an existing project
          </Button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hud-wrapper {
  width: 320px;
  background: var(
    --color-bg-surface
  ); /* Solid opaque background to avoid transparency rendering issues */
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden; /* Keep content clipped during transitions to avoid visual bugs */
}

.hud-wrapper.dropdown-open {
  overflow: visible; /* Allow popovers to float when active */
}

.hud-header {
  height: 60px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  -webkit-app-region: no-drag;
  margin-right: 4px;
}

.brand-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.rec-badge {
  font-size: 0.6rem;
  padding: 1px 5px;
}

.window-actions {
  display: flex;
  gap: 4px;
  -webkit-app-region: no-drag;
}

/* Override default button layout to ensure centering of the icons */
.window-actions :deep(.btn) {
  padding: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.btn-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.close-btn-override:hover {
  color: var(--color-error) !important;
}

.hud-body {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: visible; /* Prevent clipping of dropdown popovers */
}

.hud-view-enter-active,
.hud-view-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.hud-view-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.hud-view-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.settings-body {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

/* Tabs */
.tabs-container {
  background: var(--color-bg-surface-hover);
  border-radius: var(--radius-md);
  padding: 4px;
  display: flex;
  gap: 4px;
  border: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  padding: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: white;
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.tab-icon {
  width: 14px;
  height: 14px;
}

/* Previews Grid */
.form-inputs-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.tab-content-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* Tab transition animation */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.previews-container {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}

.previews-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: var(--text-muted);
}

.previews-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px;
}

.preview-card {
  border: 2px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: white;
  transition: all 0.15s ease-in-out;
  display: flex;
  flex-direction: column;
}

.preview-card:hover {
  border-color: var(--color-border-strong);
}

.preview-card.is-selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.thumbnail-wrapper {
  position: relative;
  aspect-ratio: 16/10;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.app-icon {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 4px;
  padding: 2px;
  box-shadow: var(--shadow-sm);
}

.preview-name {
  font-size: 10px;
  padding: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  font-weight: 600;
  background: #ffffff;
  border-top: 1px solid var(--color-border);
}

/* Selectors Stack */
.selectors-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.device-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  -webkit-app-region: no-drag;
}

.device-row > :last-child {
  min-width: 0;
}

.device-icon {
  width: 17px;
  height: 17px;
  color: var(--text-secondary);
}

.device-icon.is-unavailable {
  color: var(--color-error);
}

.selector-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.field-label-text {
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Record Button (Full-width Style) */
.action-section {
  display: flex;
  width: 100%;
  margin-top: auto;
}

.record-btn-override {
  width: 100% !important;
  border-radius: var(--radius-md) !important;
  padding: 0.75rem 1.5rem !important;
  font-size: 0.95rem !important;
  box-shadow: var(--shadow-md);
}

.capture-error {
  margin: 0;
  max-height: 104px;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--color-error) 45%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  color: var(--color-error);
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  -webkit-app-region: no-drag;
}

.capture-error-message {
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.capture-error-copy {
  flex: 0 0 auto;
  color: var(--color-error) !important;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--color-error);
  border-radius: 50%;
  animation: pulse-animation 1.5s infinite;
  display: inline-block;
  margin-right: 6px;
}

@keyframes pulse-animation {
  0% {
    transform: scale(0.9);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.5;
  }
  100% {
    transform: scale(0.9);
    opacity: 1;
  }
}

/* Web Link */
.web-link-container {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

.web-link-text {
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: color 0.15s ease;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-sans);
}

.web-link-text:hover {
  color: var(--color-primary);
}

.web-link-icon {
  width: 12px;
  height: 12px;
}

/* Settings View Styling */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg-element);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.item-label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.item-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.custom-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.settings-footer {
  display: flex;
  justify-content: center;
}

.return-btn {
  width: 100%;
  border-radius: var(--radius-md);
}

/* Animations */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
