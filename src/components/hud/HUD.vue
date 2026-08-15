<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { capture } from '../../api/capture';
import {
  BrowserCameraRecorder,
  listBrowserCameras,
  validateCameraAccess,
  isCameraUnavailableError,
} from '../../api/camera-recorder';
import {
  BrowserMicrophoneRecorder,
  listBrowserMicrophones,
  recordMicrophoneFailure,
} from '../../api/microphone-recorder';
import {
  BrowserSystemAudioRecorder,
  recordSystemAudioFailure,
  systemAudioSource,
} from '../../api/system-audio-recorder';
import type {
  CapturePreview,
  CaptureProject,
  CaptureSession,
  CaptureSource,
  EditorLoadingProgress,
} from '../../api/types/capture-api';
import type { ScreenRegion, ScreenRegionBounds, ScreenRegionOverlayOptions } from '../../api/types/screen-region';
import Button from '~/ui/button/Button.vue';
import Select from '~/ui/select/Select.vue';
import ButtonGroup from '~/ui/button/ButtonGroup.vue';
import Skeleton from '~/ui/skeleton/Skeleton.vue';
import TopbarHUD from './TopbarHUD.vue';
import SourceSelect from './SourceSelect.vue';
import { matchScreenPreview } from './source-preview';
import { Monitor, Layout, ArrowUpRight, Video, VideoOff, Crop, ScrollText, Copy, Check } from '@lucide/vue';
import { useTranslate } from '~/i18n/useTranslate';
import { useAudioLevelMeter } from './audio/useAudioLevelMeter';
import AudioIconMeter from './audio/AudioIconMeter.vue';
import EditorPreparingHud from './EditorPreparingHud.vue';
import type { RecordingBarVisibility } from './recorder/recording-types';
import { useInteractionAccess } from './interactions/useInteractionAccess';
import { useHudNavigation } from './navigation/useHudNavigation';
import { useNativeSystemAudioPreview } from './recorder/useNativeSystemAudioPreview';

const { t } = useTranslate('HUD');
const { t: tPrefs } = useTranslate('HudPreferences');
const desktopPlatform = window.capture?.platform ?? 'unknown';

interface SavedDevices {
  cameraId?: string;
  micId?: string;
  systemAudioMode?: 'on' | 'off';
}
let savedDevices: SavedDevices | null = null;

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
    showTopbar?: boolean;
    preparingEditor?: boolean;
    editorLoadingProgress?: EditorLoadingProgress;
    externalError?: string;
  }>(),
  {
    embedded: false,
    showTopbar: false,
    preparingEditor: false,
    editorLoadingProgress: () => ({ stage: 'openingWindow', value: 10 }),
  },
);

const emit = defineEmits(['start-recording', 'stop-recording', 'open-project', 'focus-feature']);
const ProjectPicker = defineAsyncComponent(() => import('../projects/ProjectPicker.vue'));
const HudPreferences = defineAsyncComponent(() => import('./settings/HudPreferences.vue'));

// Window state
const activeTab = ref<'screen' | 'window'>('screen');
const isRecording = ref(false);
const isBusy = ref(false);
const errorMessage = ref('');
const shownError = computed(() => props.externalError || errorMessage.value);
const copiedError = ref(false);
let copiedErrorTimeout: ReturnType<typeof setTimeout> | null = null;
const sources = ref<CaptureSource[]>([]);
const sourceDiscoveryCompleted = ref(false);

// Navigation & View State (Main vs Settings vs Project Picker)
const navigation = useHudNavigation();
const showSettings = navigation.showSettings;
const settingsView = navigation.settingsView;
const showProjectPicker = navigation.showProjectPicker;

// Preference settings
const countdownSeconds = ref(3); // 0 for Off, 3, 5, 10
const recordingBarVisibility = ref<RecordingBarVisibility>('always');
watch(recordingBarVisibility, (value) => void capture.updatePreferences({ recordingBar: { visibility: value } }));
const interactionAccess = useInteractionAccess(desktopPlatform);
const alwaysOnTop = ref(true);
watch(alwaysOnTop, (value) => void capture.updatePreferences({ alwaysOnTop: value }));

// Previews
const windowPreviews = ref<CapturePreview[]>([]);
const screenPreviews = ref<CapturePreview[]>([]);
const windowPreviewsLoading = ref(false);
const screenPreviewsLoading = ref(false);
const selectedSourceId = ref<string | null>(null);

// Sources lists (Camera / Microphone)
const cameraOptions = computed(() => [
  ...sources.value
    .filter((source) => source.kind === 'camera')
    .map((source) => ({ value: source.id, label: source.label })),
  { value: 'off', label: t('cameraOff') },
]);
const selectedCameraId = ref('off');

const micOptions = computed(() => [
  ...sources.value
    .filter((source) => source.kind === 'microphone')
    .map((source) => ({ value: source.id, label: source.label })),
  { value: 'no-audio', label: t('noAudio') },
]);
const selectedMicId = ref('no-audio');
const isTeleprompterVisible = ref(false);
const selectedScreenId = ref<string | null>(null);
const selectedScreenRegion = ref<ScreenRegion | null>(null);
const selectedScreenOverlay = ref<ScreenRegionOverlayOptions | null>(null);
const nativeScreenBounds = ref<ScreenRegionBounds | null>(null);
const savedScreenRegion = ref<ScreenRegion | null>(null);
const isRegionSelectionLeaving = ref(false);
const isRegionSelectionEntering = ref(false);
const isRegionConfirmationAnimating = ref(false);
let regionSelectionEnterTimeout: ReturnType<typeof setTimeout> | null = null;
let regionConfirmationTimeout: ReturnType<typeof setTimeout> | null = null;
const systemAudioMode = ref<'on' | 'off'>('off');

const isMicEnabled = computed(() => selectedMicId.value !== 'no-audio');
const { level: micLevel } = useAudioLevelMeter(
  computed(() => !props.embedded && isMicEnabled.value),
  selectedMicId,
);
const { level: systemAudioLevel } = useNativeSystemAudioPreview(
  computed(
    () =>
      desktopPlatform === 'linux' &&
      !props.embedded &&
      systemAudioMode.value === 'on' &&
      !isRecording.value &&
      !isBusy.value,
  ),
);

watch([selectedCameraId, selectedMicId, systemAudioMode], () => {
  if (props.embedded) return;
  void capture.updatePreferences({
    devices: { cameraId: selectedCameraId.value, micId: selectedMicId.value, systemAudioMode: systemAudioMode.value },
  });
});
watch(
  [selectedCameraId],
  async () => {
    if (props.embedded) return;
    const camId = selectedCameraId.value;
    capture.configureCameraOverlay({
      cameraId: camId,
    });
    if (camId && camId !== 'off') {
      try {
        await validateCameraAccess(camId);
      } catch (err) {
        if (isCameraUnavailableError(err)) {
          selectedCameraId.value = 'off';
          errorMessage.value =
            'Camera is unavailable: hardware resources are locked by another application or Windows Media Foundation (0xC00D3704).';
        }
      }
    }
  },
  { immediate: true },
);
const displaySources = computed(() => sources.value.filter((source) => source.kind === 'display'));
const selectedScreen = computed(() => sources.value.find((source) => source.id === selectedScreenId.value) ?? null);
const hasSelectedCaptureSource = computed(() => {
  if (activeTab.value === 'screen') return selectedScreen.value !== null;
  return (
    windowPreviews.value.some((preview) => preview.id === selectedSourceId.value) ||
    sources.value.some((source) => source.kind === 'window' && source.id === selectedSourceId.value)
  );
});
const selectedScreenPreview = computed(() => {
  const source = selectedScreen.value;
  if (!source) return null;
  return matchScreenPreview(source, displaySources.value, screenPreviews.value);
});
const selectedScreenBounds = computed(
  () => nativeScreenBounds.value ?? selectedScreenPreview.value?.displayBounds ?? null,
);
let screenBoundsRequest = 0;
const refreshSelectedScreenBounds = async (): Promise<ScreenRegionBounds | null> => {
  const request = ++screenBoundsRequest;
  const displayId = selectedScreen.value?.displayId;
  if (!displayId) {
    nativeScreenBounds.value = null;
    return null;
  }
  try {
    const bounds = await capture.getDisplayBounds(displayId);
    if (request !== screenBoundsRequest) return null;
    nativeScreenBounds.value = bounds;
    return bounds;
  } catch (error) {
    if (request === screenBoundsRequest) nativeScreenBounds.value = null;
    console.error('Failed to resolve selected screen bounds:', error);
    return null;
  }
};
const systemAudioOptions = computed(() => [
  { value: 'on', label: t('systemAudio') },
  { value: 'off', label: t('off') },
]);

// Timer / Duration simulation
const recordingTime = ref('00:00');
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
  recordingTime.value = '00:00';
  timerInterval = setInterval(() => {
    secondsElapsed.value++;
    const mins = Math.floor(secondsElapsed.value / 60)
      .toString()
      .padStart(2, '0');
    const secs = (secondsElapsed.value % 60).toString().padStart(2, '0');
    recordingTime.value = `${mins}:${secs}`;
  }, 1000);
};

const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
};

type PreviewKind = 'screen' | 'window';
const previewLoaded: Record<PreviewKind, boolean> = { screen: false, window: false };
const previewRequests: Record<PreviewKind, Promise<void> | null> = { screen: null, window: null };

const loadPreviews = (type: PreviewKind, force = false): Promise<void> => {
  if (!force && previewLoaded[type]) return Promise.resolve();
  if (previewRequests[type]) return previewRequests[type];

  const target = type === 'screen' ? screenPreviews : windowPreviews;
  const loading = type === 'screen' ? screenPreviewsLoading : windowPreviewsLoading;
  if (target.value.length === 0) loading.value = true;

  const request = capture
    .getSources([type])
    .then((results) => {
      target.value = results;
      previewLoaded[type] = true;
      if (type !== 'window') return;
      const selectedPortalSource = sources.value.some(
        (source) =>
          source.id === selectedSourceId.value && source.kind === 'window' && source.selectionMode === 'portal',
      );
      if (
        !selectedPortalSource &&
        (!selectedSourceId.value || !results.some((result) => result.id === selectedSourceId.value))
      ) {
        selectedSourceId.value = results[0]?.id ?? null;
      }
    })
    .catch((error) => {
      console.error(`Failed to load ${type} previews:`, error);
    })
    .finally(() => {
      loading.value = false;
      previewRequests[type] = null;
    });

  previewRequests[type] = request;
  return request;
};

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));
const snapshotScreenBounds = (bounds: ScreenRegionBounds): ScreenRegionBounds => ({
  x: bounds.x,
  y: bounds.y,
  width: bounds.width,
  height: bounds.height,
});

const selectScreenRegion = async () => {
  if (props.embedded) return;
  if (isBusy.value || isRecording.value || isRegionSelectionLeaving.value || !selectedScreenBounds.value) return;
  const resolvedBounds = (await refreshSelectedScreenBounds()) ?? selectedScreenBounds.value;
  if (!resolvedBounds || isBusy.value || isRecording.value || isRegionSelectionLeaving.value) return;
  // Values read from Vue refs/computed values can be reactive proxies. Electron
  // IPC cannot structured-clone those proxies, so always send a plain snapshot.
  const bounds = snapshotScreenBounds(resolvedBounds);
  errorMessage.value = '';
  isRegionSelectionLeaving.value = true;
  await wait(180);
  capture.setWindowVisible(false);
  try {
    // The saved region is only a starting point for the next selection. It
    // must not activate crop mode just because the HUD was opened.
    const currentRegion = selectedScreenRegion.value ?? savedScreenRegion.value;
    const region = await capture.selectScreenRegion({
      bounds,
      region: currentRegion ? { ...currentRegion } : null,
    });
    if (!region) return;
    const isFullScreen = region.x <= 0.01 && region.y <= 0.01 && region.width >= 0.98 && region.height >= 0.98;
    if (isFullScreen) {
      selectedScreenRegion.value = null;
      selectedScreenOverlay.value = null;
      savedScreenRegion.value = null;
      void capture.updatePreferences({ extras: { screenRegion: null } });
    } else {
      const plainRegion = { ...region };
      selectedScreenRegion.value = plainRegion;
      selectedScreenOverlay.value = { bounds, region: plainRegion };
      savedScreenRegion.value = plainRegion;
      void capture.updatePreferences({ extras: { screenRegion: plainRegion } });
    }
    isRegionConfirmationAnimating.value = true;
    if (regionConfirmationTimeout) clearTimeout(regionConfirmationTimeout);
    regionConfirmationTimeout = setTimeout(() => {
      isRegionConfirmationAnimating.value = false;
      regionConfirmationTimeout = null;
    }, 700);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isRegionSelectionLeaving.value = false;
    isRegionSelectionEntering.value = true;
    capture.hideScreenRegionOverlay();
    capture.setWindowVisible(true);
    // Showing the HUD resets its native hit-test state. Force it interactive
    // until the renderer's next pointer move refines the transparent areas.
    capture.setInteractive(true);
    if (regionSelectionEnterTimeout) clearTimeout(regionSelectionEnterTimeout);
    regionSelectionEnterTimeout = setTimeout(() => {
      isRegionSelectionEntering.value = false;
      regionSelectionEnterTimeout = null;
    }, 280);
  }
};

const activeDropdowns = ref(0);
// Start without an assumed size so the first HUD render also reserves the
// outer margin required for its border and shadow.
let lastHeight = 0;
let lastWidth = 0;

const updateWindowSize = () => {
  if (props.embedded) return;
  const isDropdownOpen = activeDropdowns.value > 0;
  let targetHeight = 480;
  const errorHeight = !showSettings.value && !showProjectPicker.value && shownError.value ? 116 : 0;
  if (props.preparingEditor) {
    targetHeight = 480;
  } else if (showSettings.value) {
    targetHeight = 520;
  } else if (showProjectPicker.value) {
    targetHeight = 520;
  } else {
    if (activeTab.value === 'window') {
      targetHeight = isDropdownOpen ? 660 : 500;
    } else {
      targetHeight = isDropdownOpen ? 640 : 480;
    }
  }

  targetHeight += errorHeight;
  // Popovers are teleported and viewport-bounded; resizing the HUD horizontally
  // makes the card jump to the right without creating usable space.
  const targetWidth = 320;

  if (targetHeight > lastHeight || targetWidth > lastWidth) {
    // Grow the Electron window instantly so transitions are not clipped
    capture.setSize(targetWidth + 32, targetHeight + 32);
  } else if (targetHeight < lastHeight || targetWidth < lastWidth) {
    // Wait for the card's CSS transition (200ms) to complete before shrinking
    const snapshotDropdownOpen = activeDropdowns.value > 0;
    const snapshotHeight = targetHeight;
    const snapshotWidth = targetWidth;
    setTimeout(() => {
      const currentDropdownOpen = activeDropdowns.value > 0;
      let currentTargetHeight = 480;
      const errorHeight = !showSettings.value && !showProjectPicker.value && shownError.value ? 116 : 0;
      if (props.preparingEditor) {
        currentTargetHeight = 480;
      } else if (showSettings.value) {
        currentTargetHeight = 520;
      } else if (showProjectPicker.value) {
        currentTargetHeight = 520;
      } else {
        if (activeTab.value === 'window') {
          currentTargetHeight = currentDropdownOpen ? 660 : 500;
        } else {
          currentTargetHeight = currentDropdownOpen ? 640 : 480;
        }
      }
      currentTargetHeight += errorHeight;
      const currentTargetWidth = 320;

      // Only apply if the situation hasn't changed (don't override a subsequent open)
      if (
        currentDropdownOpen === snapshotDropdownOpen &&
        currentTargetHeight === snapshotHeight &&
        currentTargetWidth === snapshotWidth
      ) {
        capture.setSize(snapshotWidth + 32, snapshotHeight + 32);
      }
    }, 200);
  }
  lastHeight = targetHeight;
  lastWidth = targetWidth;
};

const hudHeight = computed(() => {
  if (props.preparingEditor) return 480;
  const errorHeight = !showSettings.value && !showProjectPicker.value && shownError.value ? 116 : 0;
  if (showSettings.value || showProjectPicker.value) {
    return 520 + errorHeight;
  }
  return (activeTab.value === 'window' ? 500 : 480) + errorHeight;
});

const handleDropdownToggle = (isOpen: boolean) => {
  if (isOpen) {
    activeDropdowns.value++;
  } else {
    activeDropdowns.value = Math.max(0, activeDropdowns.value - 1);
  }
  updateWindowSize();
};

// Both preview catalogs are cached. Switching tabs only changes presentation;
// a failed initial request may be retried without replacing a valid cache.
watch(activeTab, () => {
  capture.hideScreenRegionOverlay();
  if (activeTab.value !== 'screen') {
    selectedScreenRegion.value = null;
    selectedScreenOverlay.value = null;
  }
  updateWindowSize();
  void loadPreviews(activeTab.value);
});

watch(
  () => props.preparingEditor,
  () => updateWindowSize(),
);

watch(selectedScreenId, () => {
  selectedScreenRegion.value = null;
  selectedScreenOverlay.value = null;
  nativeScreenBounds.value = null;
  capture.hideScreenRegionOverlay();
  void refreshSelectedScreenBounds();
});

// Watch settings view toggle to update window size
watch(showSettings, () => {
  updateWindowSize();
});

watch(showProjectPicker, () => {
  updateWindowSize();
});

watch(shownError, () => {
  copiedError.value = false;
  updateWindowSize();
});

const copyError = async () => {
  if (!shownError.value) return;
  try {
    await navigator.clipboard.writeText(shownError.value);
  } catch {
    const text = document.createElement('textarea');
    text.value = shownError.value;
    text.setAttribute('readonly', '');
    text.style.position = 'fixed';
    text.style.opacity = '0';
    document.body.append(text);
    try {
      text.select();
      if (!document.execCommand('copy')) throw new Error('Unable to copy the error.');
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
  // Recording ownership lives in App.vue.  The HUD only collects configuration.
  if (!isRecording.value) {
    if (sourceDiscoveryCompleted.value && !hasSelectedCaptureSource.value) {
      errorMessage.value = activeTab.value === 'screen' ? t('noScreensDetected') : t('noWindowsDetected');
      return;
    }
    let screenId: string | undefined;
    if (activeTab.value === 'screen') screenId = selectedScreenId.value ?? undefined;
    else if (selectedSourceId.value) {
      // Keep Electron's complete source id (usually `window:<hwnd>:<display>`).
      // The main process canonicalizes it for the platform-specific Rust backend.
      screenId = selectedSourceId.value;
    }
    emit('start-recording', {
      screenKind: activeTab.value === 'window' ? 'window' : 'display',
      screenId,
      cameraId: selectedCameraId.value,
      microphoneId: selectedMicId.value,
      systemAudio: systemAudioMode.value === 'on',
      targetFps: 60,
      countdownSeconds: countdownSeconds.value,
      recordingBarVisibility: recordingBarVisibility.value,
      recordInteractions: interactionAccess.recordingEnabled.value,
      region: activeTab.value === 'screen' && selectedScreenRegion.value ? { ...selectedScreenRegion.value } : null,
      regionOverlay:
        activeTab.value === 'screen' && selectedScreenOverlay.value
          ? {
              bounds: { ...selectedScreenOverlay.value.bounds },
              region: selectedScreenOverlay.value.region ? { ...selectedScreenOverlay.value.region } : null,
            }
          : null,
    });
    return;
  }
  isBusy.value = true;
  errorMessage.value = '';
  try {
    if (!isRecording.value) {
      const systemAudioRequested = systemAudioMode.value === 'on';
      let systemAudio: BrowserSystemAudioRecorder | null = null;
      let systemAudioError: Error | null = null;
      if (systemAudioRequested) {
        try {
          systemAudio = await BrowserSystemAudioRecorder.request();
        } catch (error) {
          systemAudioError =
            error instanceof Error ? new Error(`${error.name}: ${error.message}`) : new Error(String(error));
        }
      }
      const camera =
        selectedCameraId.value === 'off' ? null : await BrowserCameraRecorder.request(selectedCameraId.value);
      const microphoneId = selectedMicId.value === 'no-audio' ? null : selectedMicId.value;
      let microphone: BrowserMicrophoneRecorder | null = null;
      let microphoneError: Error | null = null;
      if (microphoneId) {
        try {
          microphone = await BrowserMicrophoneRecorder.request(microphoneId);
        } catch (error) {
          microphoneError = error instanceof Error ? error : new Error(String(error));
        }
      }
      // Find matching Rust catalog ID for the selected preview source
      let rustScreenId: string | undefined = undefined;
      if (selectedSourceId.value) {
        if (activeTab.value === 'window') {
          rustScreenId = selectedSourceId.value;
        }
      }

      if (activeTab.value === 'screen') rustScreenId = selectedScreenId.value ?? undefined;

      let session: CaptureSession | undefined;
      try {
        session = await capture.startRecording({
          screenKind: activeTab.value === 'window' ? 'window' : 'display',
          screenId: rustScreenId,
          microphoneId: null,
          cameraId: camera ? selectedCameraId.value : null,
          systemAudio: false,
          cursor: true,
          targetFps: 60,
        });
        isRecording.value = session.state === 'recording' || session.state === 'degraded';
        if (!isRecording.value) throw new Error(`Unexpected state after start: ${session.state}`);
        if (camera) {
          if (!session.sessionId) throw new Error('The capture session did not provide an identifier.');
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
            void stopForMicrophoneFailure(microphone, microphoneSessionId, reason);
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
          await recordMicrophoneFailure(session.sessionId, microphoneId, microphoneError.message);
          errorMessage.value = `Microphone recording is unavailable: ${microphoneError.message}`;
        }
        if (session.sessionId && systemAudio) {
          const systemAudioSessionId = session.sessionId;
          activeSystemAudio = systemAudio;
          activeSystemAudioSessionId = systemAudioSessionId;
          systemAudio.onFatal((reason) => {
            void stopForSystemAudioFailure(systemAudio, systemAudioSessionId, reason);
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
        } else if (session.sessionId && systemAudioRequested && systemAudioError) {
          await recordSystemAudioFailure(session.sessionId, systemAudioError.message);
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
      if (!session) throw new Error('The capture session did not start.');
      startTimer();
      emit('start-recording', session);
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
          cameraStopError = error instanceof Error ? error : new Error(String(error));
          if (activeCameraSessionId) await activeCamera.fail(activeCameraSessionId, cameraStopError.message);
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
      emit('stop-recording', session);
      if (cameraStopError) throw cameraStopError;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isBusy.value = false;
  }
};

const stopForMicrophoneFailure = async (microphone: BrowserMicrophoneRecorder, sessionId: string, reason: Error) => {
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

const stopForSystemAudioFailure = async (systemAudio: BrowserSystemAudioRecorder, sessionId: string, reason: Error) => {
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

const stopForCameraFailure = async (camera: BrowserCameraRecorder, sessionId: string, reason: Error) => {
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
  errorMessage.value = '';
  sourceDiscoveryCompleted.value = false;
  try {
    const [microphones, cameras, catalog] = await Promise.all([
      listBrowserMicrophones(),
      listBrowserCameras(),
      capture.discover(),
    ]);
    sources.value = [
      ...(Array.isArray(catalog.sources) ? catalog.sources : []),
      ...cameras,
      ...microphones,
      systemAudioSource(),
    ];
    sourceDiscoveryCompleted.value = true;
    if (
      savedDevices?.cameraId &&
      (savedDevices.cameraId === 'off' || sources.value.some((s) => s.id === savedDevices?.cameraId))
    ) {
      selectedCameraId.value = savedDevices.cameraId;
    } else {
      selectedCameraId.value = 'off';
    }

    if (
      savedDevices?.micId &&
      (savedDevices.micId === 'no-audio' || sources.value.some((s) => s.id === savedDevices?.micId))
    ) {
      selectedMicId.value = savedDevices.micId;
    } else {
      selectedMicId.value = 'no-audio';
    }

    if (
      savedDevices?.systemAudioMode &&
      (savedDevices.systemAudioMode === 'on' || savedDevices.systemAudioMode === 'off')
    ) {
      systemAudioMode.value = savedDevices.systemAudioMode;
    } else {
      systemAudioMode.value = 'off';
    }

    selectedScreenId.value =
      sources.value.find((source) => source.kind === 'display' && source.isDefault)?.id ??
      sources.value.find((source) => source.kind === 'display')?.id ??
      null;
    selectedSourceId.value =
      sources.value.find((source) => source.kind === 'window' && source.selectionMode === 'portal' && source.isDefault)
        ?.id ??
      sources.value.find((source) => source.kind === 'window' && source.selectionMode === 'portal')?.id ??
      selectedSourceId.value;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isBusy.value = false;
  }
};

let unsubscribeShortcut: (() => void) | null = null;
let unsubscribeTeleprompterVisibility: (() => void) | null = null;

const toggleTeleprompter = () => {
  if (props.embedded) return;
  isTeleprompterVisible.value = !isTeleprompterVisible.value;
  if (isTeleprompterVisible.value) capture.showTeleprompter();
  else capture.hideTeleprompter();
};

onMounted(async () => {
  if (props.embedded) return;
  const preferences = await capture.getPreferences();
  savedDevices = preferences.devices as unknown as SavedDevices;
  const savedRegion = preferences.extras?.screenRegion;
  if (savedRegion && typeof savedRegion === 'object') {
    const candidate = savedRegion as Partial<ScreenRegion>;
    if (
      [candidate.x, candidate.y, candidate.width, candidate.height].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ) &&
      candidate.x! >= 0 &&
      candidate.y! >= 0 &&
      candidate.width! > 0 &&
      candidate.height! > 0 &&
      candidate.x! + candidate.width! <= 1 &&
      candidate.y! + candidate.height! <= 1
    ) {
      savedScreenRegion.value = {
        x: candidate.x!,
        y: candidate.y!,
        width: candidate.width!,
        height: candidate.height!,
      };
    }
  }
  recordingBarVisibility.value = preferences.recordingBar.visibility;
  interactionAccess.hydrate(preferences);
  alwaysOnTop.value = preferences.alwaysOnTop ?? true;
  if (!props.embedded) updateWindowSize();
  await Promise.all([discoverSources(), interactionAccess.refresh()]);
  await Promise.allSettled([loadPreviews('screen'), loadPreviews('window')]);

  unsubscribeShortcut = capture.onPreferenceShortcut((actionId: string) => {
    if (actionId === 'hud.startStopRecording') {
      void toggleRecording();
    }
  });
  unsubscribeTeleprompterVisibility = capture.onTeleprompterVisibility((visible) => {
    isTeleprompterVisible.value = visible;
  });

  // Periodically refresh window previews when settings is not open and not recording
  previewsRefreshInterval = setInterval(() => {
    if (!showSettings.value && !isRecording.value && activeTab.value === 'window') {
      void loadPreviews('window', true);
    }
  }, 5000);
});

onBeforeUnmount(() => {
  screenBoundsRequest++;
  if (!props.embedded) capture.hideScreenRegionOverlay();
  if (regionSelectionEnterTimeout) clearTimeout(regionSelectionEnterTimeout);
  if (regionConfirmationTimeout) clearTimeout(regionConfirmationTimeout);
  unsubscribeShortcut?.();
  unsubscribeTeleprompterVisibility?.();
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
  if (props.embedded) return;
  capture.quit();
};

const minimizeApp = () => {
  if (props.embedded) return;
  document.body.classList.add('app-minimizing');
  setTimeout(() => {
    capture.minimize();
    document.body.classList.remove('app-minimizing');
  }, 160);
};

const openProjectPicker = () => {
  navigation.openProjects();
  emit('focus-feature', 'projects');
};

const closeProjectPicker = () => {
  navigation.openHud();
};

const handleTopbarBack = () => {
  navigation.handleTopbarBack();
};

const openProject = (project: CaptureProject) => {
  if (props.embedded) return;
  closeProjectPicker();
  emit('open-project', project);
};
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
        v-model:always-on-top="alwaysOnTop"
        @update:countdown-seconds="countdownSeconds = $event"
        @update:recording-bar-visibility="recordingBarVisibility = $event"
        @update:record-interactions="interactionAccess.setEnabled"
        @request-input-access="interactionAccess.request"
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

        <div class="form-inputs-area">
          <Transition name="fade-slide" mode="out-in">
            <div :key="activeTab" class="tab-content-container">
              <!-- Capture source (macOS / Windows only, on Linux PipeWire portal handles source selection on record) -->
              <template v-if="desktopPlatform !== 'linux'">
                <template v-if="activeTab === 'window'">
                  <div class="device-row">
                    <Layout class="device-icon" />
                    <SourceSelect
                      v-model="selectedSourceId"
                      kind="window"
                      :sources="sources"
                      :previews="windowPreviews"
                      :loading="windowPreviewsLoading"
                      :disabled="isRecording || isBusy"
                      @toggle="
                        handleDropdownToggle($event);
                        if ($event) emit('focus-feature', 'source');
                      "
                    />
                  </div>
                </template>

                <div v-else class="device-row">
                  <Monitor class="device-icon" />
                  <div class="screen-select-controls">
                    <SourceSelect
                      v-model="selectedScreenId"
                      kind="screen"
                      :sources="sources"
                      :previews="screenPreviews"
                      :loading="screenPreviewsLoading"
                      :disabled="isRecording || isBusy || displaySources.length === 0"
                      @toggle="
                        handleDropdownToggle($event);
                        if ($event) emit('focus-feature', 'source');
                      "
                    />
                    <Button
                      :variant="selectedScreenRegion ? 'primary' : 'secondary'"
                      size="sm"
                      icon-only
                      :icon="isRegionConfirmationAnimating ? Check : Crop"
                      :aria-label="selectedScreenRegion ? t('screenRegionSelected') : t('selectScreenRegion')"
                      :tooltip="selectedScreenRegion ? t('editScreenRegion') : t('selectScreenRegion')"
                      :disabled="isRecording || isBusy || !selectedScreenBounds"
                      :class="{
                        'screen-region-confirmed': Boolean(selectedScreenRegion),
                        'screen-region-checkmark': isRegionConfirmationAnimating,
                      }"
                      @click="
                        selectScreenRegion();
                        emit('focus-feature', 'source');
                      "
                    />
                  </div>
                </div>
              </template>

              <!-- Audio and input devices -->
              <div class="selectors-stack">
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

        <div v-if="shownError" class="capture-error" role="alert">
          <p class="capture-error-message">{{ shownError }}</p>
          <Button
            variant="ghost"
            size="sm"
            class="capture-error-copy"
            :icon="copiedError ? Check : Copy"
            @click="copyError"
          >
            {{ copiedError ? t('copied') : t('copyError') }}
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
            :disabled="isBusy || (!isRecording && sourceDiscoveryCompleted && !hasSelectedCaptureSource)"
            @click="
              toggleRecording();
              emit('focus-feature', 'record');
            "
          >
            <template #icon>
              <span class="pulse-dot" v-if="isRecording"></span>
            </template>
            {{
              isBusy ? t('pleaseWait') : isRecording ? t('stopRecording', { time: recordingTime }) : t('startRecording')
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

<style scoped>
.hud-wrapper {
  width: calc(100% - 32px);
  margin: 16px;
  background: var(--color-bg-surface); /* Solid opaque background to avoid transparency rendering issues */
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden; /* Keep content clipped during transitions to avoid visual bugs */
}

.hud-wrapper.embedded {
  width: 320px !important;
  max-width: 100%;
  max-height: 440px !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  border: 1px solid var(--color-border) !important;
  box-shadow: var(--shadow-xl) !important;
  background: var(--color-bg-surface) !important;
  border-radius: var(--radius-lg) !important;
  height: auto !important;
}

.hud-wrapper.region-selection-leaving {
  animation: hud-region-out 180ms cubic-bezier(0.4, 0, 1, 1) forwards;
  pointer-events: none;
}

.hud-wrapper.region-selection-entering {
  animation: hud-region-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.screen-select-controls :deep(.screen-region-confirmed) {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.screen-select-controls :deep(.screen-region-checkmark .btn-icon) {
  animation: screen-region-checkmark 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes hud-region-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
    filter: blur(3px);
  }
}

@keyframes hud-region-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.97);
    filter: blur(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes screen-region-checkmark {
  0% {
    opacity: 0;
    transform: scale(0.45) rotate(-18deg);
  }
  45% {
    opacity: 1;
    transform: scale(1.2) rotate(0deg);
  }
  70% {
    transform: scale(0.92);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.screen-select-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.screen-select-controls > :first-child {
  flex: 1;
  min-width: 0;
}
.mic-select-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.mic-select-controls > :first-child {
  flex: 1;
  min-width: 0;
}
.mic-select-controls :deep(.btn-primary) {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent);
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
  -webkit-app-region: no-drag;
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
  min-height: 0;
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
.mode-tabs {
  width: 100%;
}

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
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: visible;
}

.hud-wrapper.dropdown-open .form-inputs-area {
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
  flex: 0 0 auto;
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
  flex: 0 0 auto;
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
