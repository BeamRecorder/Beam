const { createQuickSnipSourceSelection } = require('./quick-snip-source-selection.cjs');
const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled']);

function createQuickSnipController(dependencies) {
  let snapshot = {
    state: 'idle',
    job: null,
    progress: 0,
    result: null,
    error: null,
    etaSeconds: null,
    preview: null,
    copied: false,
    clipboardError: null,
  };
  const selection = { generation: 0, pending: false, display: null };
  let processingAbort = null;
  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    dependencies.onStateChanged?.({ ...snapshot });
    dependencies.tray?.setQuickSnipState?.(snapshot.state);
    return snapshot;
  };
  const reset = () =>
    publish({
      state: 'idle',
      job: null,
      progress: 0,
      result: null,
      error: null,
      etaSeconds: null,
      preview: null,
      copied: false,
      clipboardError: null,
    });
  const selectedPreset = (mode = snapshot.job?.mode) => {
    const document = (mode === 'screenshot' ? dependencies.screenshotPresetStore : dependencies.presetStore).read();
    const preset = document.presets.find((preset) => preset.id === document.activePresetId) ?? document.presets[0];
    if (preset.id !== 'default') return preset;
    return {
      ...preset,
      settings: {
        ...preset.settings,
        devices: {
          ...preset.settings.devices,
          ...dependencies.preferencesStore.read().devices,
        },
      },
    };
  };
  const beginSelection = async (sourceOptions = null) => {
    if (dependencies.isNormalRecordingActive?.()) throw new Error('Quick Snip is unavailable during a Beam recording.');
    selection.generation += 1;
    dependencies.statusWindow?.hide();
    const preferences = dependencies.preferencesStore.read();
    const display = dependencies.resolveDisplay(
      preferences.extras?.quickSnipBarDisplayId ?? preferences.extras?.quickSnipRegion?.displayId,
    );
    selection.display = display;
    const region = sourceOptions?.region ?? null;
    const mode = sourceOptions
      ? 'instant'
      : ['studio', 'instant', 'screenshot'].includes(preferences.extras?.captureMode)
        ? preferences.extras.captureMode
        : 'studio';
    const preset = selectedPreset(mode);
    const format = preset.settings.export?.format === 'webm' ? 'webm' : 'mp4';
    const configuration = {
      mode,
      format,
      name: `Quick Snip ${new Date().toISOString().replace(/[:.]/g, '-')}`,
      preset,
      zoomMode: ['off', '2d', '3d'].includes(preferences.extras.recordingZoomMode)
        ? preferences.extras.recordingZoomMode
        : '2d',
      automaticZoom: preferences.extras.recordingZoomMode !== 'off',
      captureTarget: sourceOptions?.screenKind === 'window' ? 'window' : sourceOptions?.region ? 'region' : 'screen',
      sourceReady: Boolean(sourceOptions),
      countdownSeconds:
        Number.isInteger(preferences.extras.recordingCountdownSeconds) &&
        preferences.extras.recordingCountdownSeconds >= 0 &&
        preferences.extras.recordingCountdownSeconds <= 10
          ? preferences.extras.recordingCountdownSeconds
          : 3,
      screenKind: 'display',
      region,
      regionBounds: display.bounds,
      displayId: String(display.id),
      screenId: undefined,
      devices: preset.settings.devices,
      screenshotAction: 'copy',
      showRealCursor: preferences.extras.showRealCursor === true,
      hideTaskbar: preferences.extras.hideTaskbar === true,
      hideDesktopIcons: preferences.extras.hideDesktopIcons === true,
      ...(sourceOptions
        ? {
            screenKind: sourceOptions.screenKind ?? 'display',
            screenId: sourceOptions.screenId,
            region: sourceOptions.region ?? null,
            regionBounds: sourceOptions.regionBounds ?? display.bounds,
            countdownSeconds: sourceOptions.countdownSeconds,
            hideTaskbar: sourceOptions.hideTaskbar === true,
            hideDesktopIcons: sourceOptions.hideDesktopIcons === true,
            showRealCursor: sourceOptions.showRealCursor === true,
            devices: sourceOptions.devices ?? preset.settings.devices,
          }
        : {}),
    };
    publish({
      state: 'selecting',
      job: configuration,
      progress: 0,
      result: null,
      error: null,
      etaSeconds: null,
      preview: null,
      copied: false,
      clipboardError: null,
    });
    if (mode === 'screenshot') dependencies.statusWindow.prepare(snapshot);
    selection.pending = false;
    try {
      dependencies.cropWindow.show(configuration, display);
    } catch (error) {
      return report({ type: 'failed', error: error.message });
    }
    return snapshot;
  };
  const resolveSource = createQuickSnipSourceSelection(dependencies, {
    selection,
    snapshot: () => snapshot,
    publish,
    start: () => start(),
  });
  const start = async (overrides = {}) => {
    if (snapshot.state !== 'selecting' || !snapshot.job) return snapshot;
    if (dependencies.isNormalRecordingActive?.()) throw new Error('Quick Snip is unavailable during a Beam recording.');
    configure(overrides);
    if (selection.pending) {
      dependencies.cropWindow.setParentWindow?.(null);
      dependencies.regionOverlay.confirmCurrent?.();
      return snapshot;
    }
    if (!snapshot.job.sourceReady) {
      await resolveSource(snapshot.job.captureTarget ?? 'screen');
      if (snapshot.state !== 'selecting' || !snapshot.job?.sourceReady) return snapshot;
    }
    const mode = snapshot.job.mode;
    const preset = selectedPreset(mode);
    const job = {
      ...snapshot.job,
      mode,
      preset,
      outputRoot: dependencies.userPaths.instantProjects,
    };
    publish({ state: 'preparing', job, error: null });
    if (mode === 'screenshot' && job.screenshotAction !== 'edit') dependencies.statusWindow.prepare(snapshot);
    dependencies.cropWindow.updateConfiguration?.(job);
    dependencies.cropWindow.command('start');
    return snapshot;
  };
  const configure = (overrides = {}) => {
    if (snapshot.state !== 'selecting' || !snapshot.job) return snapshot;
    const mode = overrides.mode ?? snapshot.job.mode;
    if (!['studio', 'instant', 'screenshot'].includes(mode)) throw new Error('Invalid capture mode.');
    if (overrides.screenshotAction !== undefined && !['copy', 'edit'].includes(overrides.screenshotAction))
      throw new Error('Invalid screenshot action.');
    const changedMode = mode !== snapshot.job.mode;
    const changedPresetKind = (mode === 'screenshot') !== (snapshot.job.mode === 'screenshot');
    const preset = selectedPreset(mode);
    if (overrides.zoomMode !== undefined && !['off', '2d', '3d'].includes(overrides.zoomMode))
      throw new Error('Invalid zoom preference.');
    if (
      overrides.countdownSeconds !== undefined &&
      (!Number.isInteger(overrides.countdownSeconds) ||
        overrides.countdownSeconds < 0 ||
        overrides.countdownSeconds > 10)
    )
      throw new Error('Invalid countdown.');
    const options = {};
    for (const key of ['hideTaskbar', 'hideDesktopIcons', 'showRealCursor']) {
      if (overrides[key] !== undefined) {
        if (typeof overrides[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
        options[key] = overrides[key];
      }
    }
    if (overrides.countdownSeconds !== undefined) options.countdownSeconds = overrides.countdownSeconds;
    if (!changedPresetKind && mode !== 'screenshot' && preset.id === 'default' && overrides.devices)
      dependencies.preferencesStore.patch({ devices: overrides.devices });
    dependencies.preferencesStore.patch({ extras: { captureMode: mode } });
    const zoomMode = overrides.zoomMode ?? snapshot.job.zoomMode ?? '2d';
    dependencies.preferencesStore.patch({
      extras: {
        recordingZoomMode: zoomMode,
        ...(options.countdownSeconds !== undefined ? { recordingCountdownSeconds: options.countdownSeconds } : {}),
        ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'countdownSeconds')),
      },
    });
    const job = {
      ...snapshot.job,
      ...options,
      zoomMode,
      mode,
      preset,
      format: preset.settings.export?.format === 'webm' ? 'webm' : 'mp4',
      automaticZoom: zoomMode !== 'off',
      devices:
        changedPresetKind || preset.id !== snapshot.job.preset.id
          ? preset.settings.devices
          : (overrides.devices ?? snapshot.job.devices),
      screenshotAction: overrides.screenshotAction ?? snapshot.job.screenshotAction,
    };
    const result = publish({ job });
    dependencies.cropWindow.updateConfiguration?.(job);
    if (changedMode) {
      if (mode === 'screenshot') dependencies.statusWindow.prepare(snapshot);
      else if (changedPresetKind) dependencies.statusWindow.hide();
    }
    return result;
  };
  const updateSelectionRegion = (region, bounds) => {
    if (snapshot.state !== 'selecting' || !selection.pending || !snapshot.job || !selection.display) return false;
    snapshot = { ...snapshot, job: { ...snapshot.job, region, regionBounds: bounds } };
    return true;
  };
  const stop = async () => {
    if (snapshot.state !== 'recording') return snapshot;
    publish({ state: 'finalizing' });
    dependencies.cropWindow.command('stop');
    dependencies.statusWindow.update(snapshot);
    return snapshot;
  };
  const cancel = async ({ keepStatus = false } = {}) => {
    if (snapshot.state === 'idle') return snapshot;
    const cancelSelection = snapshot.state === 'selecting' && selection.pending;
    selection.generation += 1;
    selection.pending = false;
    if (cancelSelection) {
      dependencies.regionOverlay.cancel();
      dependencies.cancelSourceSelection?.();
    }
    if (
      ['preparing', 'recording'].includes(snapshot.state) ||
      (snapshot.state === 'processing' && snapshot.job?.mode === 'screenshot')
    )
      dependencies.cropWindow.command('cancel');
    processingAbort?.abort();
    processingAbort = null;
    dependencies.cropWindow.hide();
    publish({ state: 'canceled', progress: 0 });
    if (!keepStatus) dependencies.statusWindow.hide();
    return snapshot;
  };
  const toggle = async () => {
    if (snapshot.state === 'idle' || TERMINAL_STATES.has(snapshot.state)) {
      if (TERMINAL_STATES.has(snapshot.state)) reset();
      return beginSelection();
    }
    if (snapshot.state === 'selecting') {
      if (!snapshot.job) {
        dependencies.regionOverlay.confirmCurrent?.();
        return snapshot;
      }
      return start();
    }
    if (snapshot.state === 'preparing') return cancel();
    if (snapshot.state === 'recording') return stop();
    if (snapshot.state === 'finalizing' || snapshot.state === 'processing') {
      dependencies.statusWindow.show();
      return snapshot;
    }
    return snapshot;
  };
  const report = async (event) => {
    if (!event || typeof event !== 'object') return snapshot;
    if (TERMINAL_STATES.has(snapshot.state)) return snapshot;
    if (event.type === 'restarting') {
      if (snapshot.state !== 'recording' || event.name !== snapshot.job?.name) return snapshot;
      return publish({
        state: 'preparing',
        progress: 0,
        result: null,
        error: null,
      });
    }
    if (event.type === 'capture-cancelled') {
      if (snapshot.state !== 'preparing' || event.name !== snapshot.job?.name) return snapshot;
      dependencies.statusWindow.hide();
      publish({ state: 'selecting', error: null });
      dependencies.cropWindow.showExisting();
      return snapshot;
    }
    if (event.type === 'recording' && snapshot.state === 'preparing') {
      dependencies.cropWindow.setRecording(true);
      return publish({ state: 'recording' });
    }
    if (event.type === 'failed') {
      if (snapshot.state === 'selecting') {
        selection.generation += 1;
        if (selection.pending) {
          dependencies.cropWindow.setParentWindow?.(null);
          dependencies.regionOverlay.cancel();
          dependencies.cancelSourceSelection?.();
        }
        selection.pending = false;
      }
      dependencies.cropWindow.hide();
      dependencies.statusWindow.update(
        publish({
          state: 'failed',
          error: String(event.error || 'Quick Snip failed.'),
        }),
      );
      return snapshot;
    }
    if (event.type === 'screenshot-captured') {
      if (snapshot.state !== 'preparing' || snapshot.job?.mode !== 'screenshot' || event.name !== snapshot.job.name)
        return snapshot;
      const document = dependencies.screenshotStore.read(event.screenshotId);
      dependencies.cropWindow.hide();
      dependencies.statusWindow.update(
        publish({
          state: 'processing',
          progress: 0.25,
          preview: document.source,
          job: { ...snapshot.job, projectId: document.id },
        }),
      );
      return snapshot;
    }
    if (event.type === 'screenshot-rendered') {
      if (snapshot.state !== 'processing' || snapshot.job?.mode !== 'screenshot' || event.name !== snapshot.job.name)
        return snapshot;
      if (
        typeof event.preview !== 'string' ||
        event.preview.length > 200_000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(event.preview)
      )
        throw new Error('Invalid screenshot preview.');
      dependencies.statusWindow.update(publish({ progress: 0.75, preview: event.preview }));
      return snapshot;
    }
    if (
      event.type === 'screenshot' &&
      ['preparing', 'processing'].includes(snapshot.state) &&
      snapshot.job.mode === 'screenshot'
    ) {
      if (event.name !== snapshot.job.name) return snapshot;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.screenshotId ?? ''))
        throw new Error('Invalid screenshot result.');
      dependencies.cropWindow.hide();
      const generation = selection.generation;
      publish({
        state: 'processing',
        progress: 1,
        copied: snapshot.job.screenshotAction !== 'edit',
        job: { ...snapshot.job, projectId: event.screenshotId },
        preview: snapshot.preview,
        result: { path: '', projectId: event.screenshotId },
      });
      try {
        if (snapshot.job.screenshotAction === 'edit') await dependencies.openScreenshot(event.screenshotId);
        if (generation !== selection.generation) return snapshot;
        publish({ state: 'completed' });
        if (snapshot.job.screenshotAction !== 'edit') dependencies.statusWindow.update(snapshot);
      } catch (error) {
        if (generation === selection.generation) return report({ type: 'failed', error: String(error) });
      }
      return snapshot;
    }
    if (event.type === 'completed' && ['finalizing', 'recording'].includes(snapshot.state)) {
      dependencies.cropWindow.hide();
      const generation = selection.generation;
      const thumbnail = await dependencies.thumbnail?.(event.session).catch(() => null);
      if (generation !== selection.generation || !['finalizing', 'recording'].includes(snapshot.state)) return snapshot;
      publish({
        state: 'processing',
        progress: 0,
        job: {
          ...snapshot.job,
          projectId: event.session?.projectId ?? null,
          thumbnail,
        },
      });
      dependencies.statusWindow.update(snapshot);
      const abort = new AbortController();
      processingAbort = abort;
      const startedAt = performance.now();
      try {
        const result = await dependencies.finalize({
          session: event.session,
          configuration: snapshot.job,
          signal: abort.signal,
          onProgress: (progress, details = {}) => {
            if (!abort.signal.aborted && snapshot.state === 'processing') {
              const elapsed = (performance.now() - startedAt) / 1000;
              const etaSeconds = progress > 0.1 && elapsed >= 1 ? (elapsed * (1 - progress)) / progress : null;
              snapshot = {
                ...snapshot,
                progress,
                etaSeconds,
                ...(details.preview ? { preview: details.preview } : {}),
              };
              dependencies.statusWindow.update(snapshot);
            }
          },
        });
        if (abort.signal.aborted || snapshot.state !== 'processing') return snapshot;
        let copied = false;
        let clipboardError = null;
        try {
          await dependencies.copyFile?.(result.path);
          copied = true;
        } catch (error) {
          clipboardError = error instanceof Error ? error.message : String(error);
        }
        if (abort.signal.aborted || snapshot.state !== 'processing') return snapshot;
        dependencies.statusWindow.update(
          publish({
            state: 'completed',
            progress: 1,
            result,
            copied,
            clipboardError,
            etaSeconds: 0,
          }),
        );
      } catch (error) {
        if (abort.signal.aborted || snapshot.state === 'canceled') return snapshot;
        dependencies.statusWindow.update(
          publish({
            state: 'failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        if (processingAbort === abort) processingAbort = null;
      }
    }
    return snapshot;
  };
  return {
    toggle,
    async fromHud(options) {
      if (!options || typeof options !== 'object' || !['display', 'window'].includes(options.screenKind))
        throw new Error('Invalid Instant capture source.');
      if (!['idle', 'completed', 'failed', 'canceled'].includes(snapshot.state))
        throw new Error('Another capture is already active.');
      reset();
      await beginSelection(options);
      return start();
    },
    configure,
    async chooseSource(target) {
      if (!['screen', 'region', 'window'].includes(target)) throw new Error('Invalid Quick Snip source.');
      if (snapshot.state !== 'selecting' || !snapshot.job || selection.pending) return snapshot;
      const job = { ...snapshot.job, captureTarget: target, sourceReady: false, screenId: undefined, region: null };
      const result = publish({ job });
      dependencies.cropWindow.updateConfiguration?.(job);
      return result;
    },
    start,
    stop,
    cancel,
    report,
    updateSelectionRegion,
    state: () => ({ ...snapshot }),
    reset,
  };
}

module.exports = { createQuickSnipController };
