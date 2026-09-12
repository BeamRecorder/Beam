import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { capture } from '../../api/capture';
import { rememberCaptureCatalog } from '../../api/capture-diagnostics';
import { listBrowserCameras } from '~/api/camera-recorder';
import { listBrowserMicrophones } from '~/api/microphone-recorder';
import { systemAudioSource } from '~/api/system-audio-recorder';
import type { CapturePreview, CaptureCatalog, CaptureProject, CaptureSource } from '../../api/types/capture-api';
import type { ScreenRegion } from '../../api/types/screen-region';
import { matchScreenPreview } from './source-preview';
import { useTranslate } from '~/i18n/useTranslate';
import { useAudioLevelMeter } from './audio/useAudioLevelMeter';
import type { RecordingBarVisibility } from './recorder/recording-types';
import { useInteractionAccess } from './interactions/useInteractionAccess';
import { useHudNavigation } from './navigation/useHudNavigation';
import { useNativeSystemAudioPreview } from './recorder/useNativeSystemAudioPreview';
import { useHudIssues } from './useHudIssues';
import { useHudCaptureMode } from './useHudCaptureMode';

import { useHudWindow } from './useHudWindow';
import type { HudProps, HudEmit, SavedDevices, PreviewKind } from './hud-state-types';

export function useHudState(props: HudProps, emit: HudEmit) {
  const { t } = useTranslate('HUD');
  const { t: tPrefs } = useTranslate('HudPreferences');
  const desktopPlatform = window.capture?.platform ?? 'unknown';

  let savedDevices: SavedDevices | null = null;

  // Window state
  const activeTab = ref<'screen' | 'window'>('screen');
  const isRecording = ref(false);
  const isBusy = ref(!props.embedded);
  const errorMessage = ref('');
  const shownError = computed(() => props.externalError || errorMessage.value);
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
  const captureCatalog = ref<CaptureCatalog | null>(null);
  const { captureMode, hydrateMode, modeShortcut, captureWithMode } = useHudCaptureMode(
    isBusy,
    errorMessage,
    props.embedded,
  );
  const { hudIssues, authorizeInteractionAccess, handleHudIssueAction } = useHudIssues(
    captureCatalog,
    shownError,
    interactionAccess,
  );

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
  const systemAudioMode = ref<'on' | 'off'>('off');

  const isMicEnabled = computed(() => selectedMicId.value !== 'no-audio');
  const { level: micLevel } = useAudioLevelMeter(
    computed(() => !props.embedded && captureMode.value !== 'screenshot' && isMicEnabled.value),
    selectedMicId,
  );
  const { level: systemAudioLevel } = useNativeSystemAudioPreview(
    computed(
      () =>
        captureMode.value !== 'screenshot' &&
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
    [selectedCameraId, captureMode],
    () => {
      if (props.embedded || captureMode.value === 'screenshot') return;
      // The overlay owns the stream and handles access errors. A second
      // getUserMedia validation competes for the same camera on Windows.
      capture.configureCameraOverlay({ cameraId: selectedCameraId.value });
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
  const {
    selectedScreenRegion,
    selectedScreenOverlay,
    savedScreenRegion,
    selectedScreenBounds,
    isRegionSelectionLeaving,
    isRegionSelectionEntering,
    isRegionConfirmationAnimating,
    activeDropdowns,
    updateWindowSize,
    hudHeight,
    handleDropdownToggle,
    selectScreenRegion,
  } = useHudWindow({
    props,
    activeTab,
    isBusy,
    isRecording,
    errorMessage,
    selectedScreen,
    selectedScreenId,
    selectedScreenPreview,
    showSettings,
    showProjectPicker,
    loadPreviews: (kind) => loadPreviews(kind),
    refreshInteraction: () => interactionAccess.refresh(),
  });
  const systemAudioOptions = computed(() => [
    { value: 'on', label: t('systemAudio') },
    { value: 'off', label: t('off') },
  ]);

  const recordingTime = ref('00:00');
  let previewsRefreshInterval: ReturnType<typeof setInterval> | null = null;

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
      await captureWithMode(
        {
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
        },
        (configuration) => emit('start-recording', configuration),
      );
      return;
    }
    emit('stop-recording');
  };

  const discoverSources = async () => {
    isBusy.value = true;
    errorMessage.value = '';
    sourceDiscoveryCompleted.value = false;
    try {
      const browserDevices = Promise.all([listBrowserMicrophones(), listBrowserCameras()]).then(
        ([microphones, cameras]) => {
          sources.value = [
            ...sources.value.filter((source) => source.kind !== 'camera' && source.kind !== 'microphone'),
            ...cameras,
            ...microphones,
          ];
          restoreBrowserDevices();
        },
      );
      const nativeSources = capture.discover().then((catalog) => {
        captureCatalog.value = catalog;
        rememberCaptureCatalog(catalog);
        sources.value = [
          ...(Array.isArray(catalog.sources) ? catalog.sources : []),
          ...sources.value.filter((source) => source.kind === 'camera' || source.kind === 'microphone'),
          systemAudioSource(),
        ];
        sourceDiscoveryCompleted.value = true;
        selectDefaultScreen();
      });
      const results = await Promise.allSettled([browserDevices, nativeSources]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      isBusy.value = false;
    }
  };

  const restoreBrowserDevices = () => {
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
  };

  const selectDefaultScreen = () => {
    selectedScreenId.value =
      sources.value.find((source) => source.kind === 'display' && source.isDefault)?.id ??
      sources.value.find((source) => source.kind === 'display')?.id ??
      null;
    selectedSourceId.value =
      sources.value.find((source) => source.kind === 'window' && source.selectionMode === 'portal' && source.isDefault)
        ?.id ??
      sources.value.find((source) => source.kind === 'window' && source.selectionMode === 'portal')?.id ??
      selectedSourceId.value;
  };

  let unsubscribeShortcut: (() => void) | null = null;
  let unsubscribeTeleprompterVisibility: (() => void) | null = null;
  let disposed = false;

  const toggleTeleprompter = () => {
    if (props.embedded) return;
    isTeleprompterVisible.value = !isTeleprompterVisible.value;
    if (isTeleprompterVisible.value) capture.showTeleprompter();
    else capture.hideTeleprompter();
  };

  onMounted(async () => {
    if (props.embedded) return;
    const preferences = await capture.getPreferences();
    if (disposed) return;
    hydrateMode(preferences);
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
    if (!props.embedded) updateWindowSize();
    unsubscribeShortcut = capture.onPreferenceShortcut((actionId: string) => {
      if (actionId === 'hud.startStopRecording') {
        void toggleRecording();
      }
    });
    unsubscribeTeleprompterVisibility = capture.onTeleprompterVisibility((visible) => {
      isTeleprompterVisible.value = visible;
    });

    await Promise.all([discoverSources(), interactionAccess.refresh()]);
    if (disposed) return;
    void loadPreviews(activeTab.value);

    // Periodically refresh window previews when settings is not open and not recording
    previewsRefreshInterval = setInterval(() => {
      if (!showSettings.value && !isRecording.value && activeTab.value === 'window') {
        void loadPreviews('window', true);
      }
    }, 5000);
  });

  onBeforeUnmount(() => {
    disposed = true;
    unsubscribeShortcut?.();
    unsubscribeTeleprompterVisibility?.();
    if (previewsRefreshInterval) clearInterval(previewsRefreshInterval);
  });

  const closeApp = () => {
    if (props.embedded) return;
    capture.close();
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

  return {
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
    discoverSources,
    loadPreviews,
  };
}
