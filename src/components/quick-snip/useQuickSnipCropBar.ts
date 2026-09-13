import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { CaptureMode } from '~/api/types/capture-mode';
import { captureQuickScreenshot } from './quick-snip-screenshot';
import { useTranslate } from '~/i18n/useTranslate';
import { usePreferencesStore } from '~/stores/preferences';
import { capture } from '~/api/capture';
import type { QuickSnipConfiguration } from '~/api/types/quick-snip';
import { useRecordingController } from '~/components/hud/recorder/useRecordingController';
import { useNativeSystemAudioPreview } from '~/components/hud/recorder/useNativeSystemAudioPreview';
import { useAudioLevelMeter } from '~/components/hud/audio/useAudioLevelMeter';

import { useQuickSnipDeviceMenu } from './useQuickSnipDeviceMenu';

export function useQuickSnipCropBar() {
  const { t } = useTranslate('QuickSnipCropBar');
  const preferences = usePreferencesStore();
  const visibility = computed(() => preferences.settings?.recordingBar.visibility ?? 'always');
  const pointerOver = ref(false);
  const selectionActive = ref(false);

  // IPC configurations are immutable snapshots; deep Vue proxies cannot cross Electron's clone boundary.
  const configuration = shallowRef<QuickSnipConfiguration | null>(null);
  const mode = ref<CaptureMode>('studio');
  const displayMode = computed({
    get: () => (mode.value === 'screenshot' ? ('screenshot' as const) : ('studio' as const)),
    set: (next: CaptureMode) => {
      mode.value = next;
    },
  });
  const deviceMenuBusy = ref(false);
  const presetKind = () => (mode.value === 'screenshot' ? 'screenshot' : 'video');
  const automaticZoom = ref(true);
  const microphone = ref(true);
  const systemAudio = ref(false);
  const camera = ref(false);
  const presetOptions = ref<Array<{ label: string; value: string }>>([{ label: '', value: 'default' }]);
  const selectedPresetId = ref('default');
  const configured = ref(false);
  const controlsEpoch = ref(0);
  const actionPending = ref(false);
  let settingsWrite = Promise.resolve();
  let commandGeneration = 0;
  let recordingJobName: string | undefined;
  const reportFailure = (reason: unknown) =>
    capture.reportQuickSnip({ type: 'failed', error: reason instanceof Error ? reason.message : String(reason) });
  const recorder = useRecordingController(
    (session) => void capture.reportQuickSnip({ type: 'completed', session }),
    (failure) => void capture.reportQuickSnip({ type: 'failed', error: failure.message }),
    () => void capture.reportQuickSnip({ type: 'capture-cancelled', name: recordingJobName }),
  );
  const enabledDeviceId = (id: unknown, disabledId: string) =>
    typeof id === 'string' && id.length > 0 && id !== disabledId ? id : 'default';
  const microphoneSourceId = computed(() =>
    microphone.value ? enabledDeviceId(configuration.value?.devices.micId, 'no-audio') : 'no-audio',
  );
  const { level: microphoneLevel } = useAudioLevelMeter(
    computed(() => microphone.value && mode.value !== 'screenshot'),
    microphoneSourceId,
  );
  const recording = computed(() => recorder.phase.value === 'recording' || recorder.phase.value === 'paused');
  const captureHint = computed(() => {
    const action = t(mode.value === 'screenshot' ? 'screenshot' : recording.value ? 'stop' : 'start');
    const shortcut = preferences.settings?.shortcuts?.['quickSnip.toggle']?.keys ?? 'Alt+Shift+S';
    return shortcut ? t('actionShortcut', { action, shortcut }) : action;
  });
  const preparing = computed(() => ['countdown', 'starting', 'finalizing'].includes(recorder.phase.value));
  const settingsDisabled = computed(
    () => !configured.value || deviceMenuBusy.value || actionPending.value || preparing.value || recording.value,
  );
  const { level: systemAudioPreviewLevel } = useNativeSystemAudioPreview(
    computed(
      () =>
        mode.value !== 'screenshot' &&
        selectionActive.value &&
        configured.value &&
        systemAudio.value &&
        !preparing.value &&
        !recording.value,
    ),
  );
  const systemAudioLevel = computed(() =>
    recording.value ? recorder.systemAudioLevel.value : systemAudioPreviewLevel.value,
  );
  const elapsed = computed(() => {
    const value = recorder.recordingTime.value.replace(/\.\d$/, '');
    const [minutes, seconds] = value.split(':').map(Number);
    if (minutes < 60) return value;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  const persistQuickSettings = async (overrides = quickSnipOverrides()) => {
    if (!configuration.value || overrides.mode === 'screenshot') return;
    const generation = commandGeneration;
    const document = await capture.getEditorPresets('video');
    if (generation !== commandGeneration) return;
    const preset = document.presets.find((candidate) => candidate.id === document.activePresetId);
    if (!preset) return;
    await capture.updateActiveEditorPreset({
      ...preset.settings,
      devices: overrides.devices,
      quickSnip: { automaticZoom: overrides.automaticZoom },
    });
  };

  const selectedDevices = () => ({
    ...configuration.value?.devices,
    micId: microphone.value ? enabledDeviceId(configuration.value?.devices.micId, 'no-audio') : 'no-audio',
    cameraId:
      mode.value !== 'screenshot' && camera.value
        ? enabledDeviceId(configuration.value?.devices.cameraId, 'off')
        : 'off',
    systemAudioMode: systemAudio.value ? 'on' : 'off',
  });
  const quickSnipOverrides = () => ({
    mode: mode.value,
    automaticZoom: mode.value !== 'screenshot' && automaticZoom.value,
    devices: selectedDevices(),
  });
  const synchronize = async () => {
    if (settingsDisabled.value) return;
    const generation = commandGeneration;
    const overrides = quickSnipOverrides();
    const changedMode = overrides.mode !== configuration.value?.mode;
    // Update the shortcut's job immediately; disk writes stay serialized in the background.
    settingsWrite = Promise.all([settingsWrite, capture.configureQuickSnip(overrides)]).then(async () => {
      if (generation === commandGeneration && !changedMode) await persistQuickSettings(overrides);
    });
    try {
      await settingsWrite;
    } catch (reason) {
      if (generation === commandGeneration) throw reason;
    }
  };

  const { chooseDevice, onDeviceKeydown } = useQuickSnipDeviceMenu({
    configuration,
    microphone,
    camera,
    systemAudio,
    busy: deviceMenuBusy,
    disabled: () => settingsDisabled.value,
    generation: () => commandGeneration,
    synchronize,
  });

  const start = async () => {
    const current = configuration.value;
    if (!current) return;
    const generation = commandGeneration;
    actionPending.value = true;
    await settingsWrite;
    if (generation !== commandGeneration) return;
    if (mode.value === 'screenshot') {
      await captureQuickScreenshot(current, () => generation === commandGeneration);
      return;
    }
    await persistQuickSettings();
    if (generation !== commandGeneration) return;
    const devices = selectedDevices();
    recordingJobName = current.name;
    await recorder.start({
      screenKind: current.screenKind,
      screenId: current.screenId,
      cameraId: devices.cameraId,
      microphoneId: devices.micId,
      systemAudio: systemAudio.value,
      targetFps: 60,
      countdownSeconds: 0,
      recordingBarVisibility: visibility.value,
      recordInteractions: true,
      region: current.region ? { ...current.region } : null,
      regionOverlay: null,
      outputRoot: current.outputRoot,
      cursor: true,
      excludedWindowHandles: current.excludedWindowHandle ? [current.excludedWindowHandle] : [],
    });
  };
  const stop = () => recorder.stop();
  const toggleFromControls = async () => {
    if (deviceMenuBusy.value || actionPending.value || preparing.value || !configured.value) return;
    const generation = commandGeneration;
    actionPending.value = true;
    try {
      if (recording.value) {
        await capture.quickSnipStop();
        return;
      }
      await settingsWrite;
      if (generation !== commandGeneration) return;
      await capture.quickSnipStart({ ...quickSnipOverrides(), screenshotAction: 'copy' });
    } catch (reason) {
      if (generation === commandGeneration) await reportFailure(reason);
    } finally {
      if (generation === commandGeneration) actionPending.value = false;
    }
  };
  const cancel = () => {
    selectionActive.value = false;
    commandGeneration += 1;
    return capture.quickSnipCancel();
  };
  const selectPreset = async (id: string | number) => {
    if (settingsDisabled.value) return;
    const generation = commandGeneration;
    actionPending.value = true;
    try {
      const document = await capture.selectEditorPreset(String(id), presetKind());
      if (generation !== commandGeneration) return;
      const preset = document.presets.find((candidate) => candidate.id === document.activePresetId);
      if (!preset || !configuration.value) return;
      selectedPresetId.value = preset.id;
      configuration.value = { ...configuration.value, preset, devices: preset.settings.devices };
      automaticZoom.value = preset.settings.quickSnip.automaticZoom;
      microphone.value = preset.settings.devices.micId !== 'no-audio';
      camera.value = preset.settings.devices.cameraId !== 'off';
      systemAudio.value = preset.settings.devices.systemAudioMode === 'on';
      actionPending.value = false;
      await synchronize();
    } catch (reason) {
      if (generation === commandGeneration) await reportFailure(reason);
    } finally {
      if (generation === commandGeneration) actionPending.value = false;
    }
  };

  const offConfigure = capture.onQuickSnipConfigure((next) => {
    if (next.name !== configuration.value?.name) {
      selectionActive.value = true;
      commandGeneration += 1;
      settingsWrite = Promise.resolve();
      actionPending.value = false;
    }
    configured.value = false;
    controlsEpoch.value += 1;
    configuration.value = next;
    mode.value = next.mode;
    automaticZoom.value = next.automaticZoom;
    selectedPresetId.value = next.preset.id;
    presetOptions.value = [{ label: next.preset.name, value: next.preset.id || 'default' }];
    microphone.value = next.devices.micId !== 'no-audio';
    camera.value = next.devices.cameraId !== 'off';
    systemAudio.value = next.devices.systemAudioMode === 'on';
    configured.value = true;
    const epoch = controlsEpoch.value;
    void capture
      .getEditorPresets(presetKind())
      .then((document) => {
        if (epoch !== controlsEpoch.value) return;
        const available = document.presets.map((preset) => ({ label: preset.name, value: preset.id }));
        if (available.length > 0) presetOptions.value = available;
      })
      .catch((reason) => {
        if (epoch === controlsEpoch.value) return reportFailure(reason);
      });
  });
  const offCommand = capture.onQuickSnipCommand((command) => {
    selectionActive.value = false;
    if (command === 'cancel') commandGeneration += 1;
    const generation = commandGeneration;
    const operation = command === 'start' ? start() : command === 'stop' ? stop() : recorder.cancel();
    void operation
      .catch((reason) => {
        if (generation === commandGeneration) return reportFailure(reason);
      })
      .finally(() => {
        if (generation === commandGeneration) actionPending.value = false;
      });
  });
  const offState = capture.onQuickSnipState((snapshot) => {
    selectionActive.value = snapshot.state === 'selecting';
  });
  onMounted(() => {
    capture.notifyQuickSnipCropReady();
    void preferences.load().catch(reportFailure);
  });
  watch(recorder.phase, (phase) => {
    if (phase === 'recording') void capture.reportQuickSnip({ type: 'recording' });
  });
  watch([mode, automaticZoom, microphone, systemAudio, camera], () => void synchronize().catch(reportFailure), {
    flush: 'sync',
  });
  onBeforeUnmount(() => {
    commandGeneration += 1;
    controlsEpoch.value += 1;
    offConfigure();
    offCommand();
    offState();
  });

  return {
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
  };
}
