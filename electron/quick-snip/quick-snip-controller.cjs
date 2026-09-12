const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled']);

function createQuickSnipController(dependencies) {
  const windowCapture = (dependencies.platform ?? process.platform) === 'linux';
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
  let selectionGeneration = 0;
  let selectionPending = false;
  let startAfterSelection = false;
  let processingAbort = null;
  let selectionDisplay = null;
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
  const selectedPreset = () => {
    const document = dependencies.presetStore.read();
    const preset = document.presets.find((preset) => preset.id === document.activePresetId) ?? document.presets[0];
    if (preset.id !== 'default') return preset;
    return {
      ...preset,
      settings: {
        ...preset.settings,
        devices: { ...preset.settings.devices, ...dependencies.preferencesStore.read().devices },
      },
    };
  };
  const beginSelection = async () => {
    if (dependencies.isNormalRecordingActive?.()) throw new Error('Quick Snip is unavailable during a Beam recording.');
    const generation = ++selectionGeneration;
    dependencies.statusWindow?.hide();
    const preferences = dependencies.preferencesStore.read();
    const display = dependencies.resolveDisplay(preferences.extras?.quickSnipRegion?.displayId);
    selectionDisplay = display;
    const saved = preferences.extras?.quickSnipRegion;
    const region = windowCapture ? null : (saved?.region ?? { x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
    const preset = selectedPreset();
    const format = preset.settings.export?.format === 'webm' ? 'webm' : 'mp4';
    const configuration = {
      mode: 'studio',
      format,
      name: `Quick Snip ${new Date().toISOString().replace(/[:.]/g, '-')}`,
      preset,
      automaticZoom: preset.settings.quickSnip.automaticZoom,
      screenKind: windowCapture ? 'window' : 'display',
      region,
      regionBounds: display.bounds,
      displayId: String(display.id),
      screenId: windowCapture ? 'portal:window' : preferences.extras?.quickSnipScreenId,
      devices: preset.settings.devices,
      rawOutputRoot: dependencies.userPaths.quickSnipWork,
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
    selectionPending = !windowCapture;
    try {
      if (windowCapture) {
        // Wayland's Portal chooses the target window when native preparation
        // starts. Screen coordinates cannot describe a crop of that window.
        dependencies.cropWindow.show(configuration, display);
        return snapshot;
      }
      const selectionPromise = dependencies.regionOverlay.select({
        bounds: display.bounds,
        region,
        context: 'quick-snip',
      });
      dependencies.cropWindow.show(configuration, display, dependencies.regionOverlay.nativeWindow?.());
      const selection = await selectionPromise;
      if (generation !== selectionGeneration || snapshot.state !== 'selecting') return snapshot;
      dependencies.cropWindow.setParentWindow?.(null);
      selectionPending = false;
      if (!selection) {
        dependencies.cropWindow.hide();
        return reset();
      }
      dependencies.preferencesStore.patch({
        extras: {
          ...preferences.extras,
          quickSnipRegion: { displayId: String(display.id), bounds: selection.bounds, region: selection.region },
        },
      });
      const selectedConfiguration = {
        ...snapshot.job,
        region: selection.region,
        regionBounds: selection.bounds,
      };
      publish({ state: 'selecting', job: selectedConfiguration });
      dependencies.cropWindow.updateRegion?.(selection.region, display);
      dependencies.cropWindow.updateConfiguration?.(selectedConfiguration);
      if (startAfterSelection) {
        startAfterSelection = false;
        return start();
      }
      return snapshot;
    } catch (error) {
      if (generation !== selectionGeneration || snapshot.state !== 'selecting') return snapshot;
      return report({ type: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  };
  const start = async (overrides = {}) => {
    if (snapshot.state !== 'selecting' || !snapshot.job) return snapshot;
    if (dependencies.isNormalRecordingActive?.()) throw new Error('Quick Snip is unavailable during a Beam recording.');
    configure(overrides);
    if (selectionPending) {
      startAfterSelection = true;
      dependencies.cropWindow.setParentWindow?.(null);
      dependencies.regionOverlay.confirmCurrent?.();
      return snapshot;
    }
    const preset = selectedPreset();
    const mode = overrides.mode ?? snapshot.job.mode;
    const job = {
      ...snapshot.job,
      ...overrides,
      mode,
      preset,
      outputRoot: mode === 'raw' ? dependencies.userPaths.quickSnipWork : dependencies.userPaths.projects,
    };
    publish({ state: 'preparing', job, error: null });
    dependencies.cropWindow.updateConfiguration?.(job);
    dependencies.cropWindow.command('start');
    return snapshot;
  };
  const configure = (overrides = {}) => {
    if (snapshot.state !== 'selecting' || !snapshot.job) return snapshot;
    if (snapshot.job.preset.id === 'default' && overrides.devices)
      dependencies.preferencesStore.patch({ devices: overrides.devices });
    return publish({ job: { ...snapshot.job, ...overrides, preset: selectedPreset() } });
  };
  const updateSelectionRegion = (region, bounds) => {
    if (snapshot.state !== 'selecting' || !selectionPending || !snapshot.job || !selectionDisplay) return false;
    snapshot = { ...snapshot, job: { ...snapshot.job, region, regionBounds: bounds } };
    dependencies.cropWindow.updateRegion?.(region, selectionDisplay);
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
    const cancelSelection = snapshot.state === 'selecting' && selectionPending;
    selectionGeneration += 1;
    selectionPending = false;
    startAfterSelection = false;
    if (cancelSelection) dependencies.regionOverlay.cancel();
    if (['preparing', 'recording'].includes(snapshot.state)) dependencies.cropWindow.command('cancel');
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
        startAfterSelection = true;
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
    if (event.type === 'recording' && snapshot.state === 'preparing') {
      dependencies.cropWindow.setRecording(true);
      return publish({ state: 'recording' });
    }
    if (event.type === 'failed') {
      if (snapshot.state === 'selecting') {
        selectionGeneration += 1;
        if (selectionPending) {
          dependencies.cropWindow.setParentWindow?.(null);
          dependencies.regionOverlay.cancel();
        }
        selectionPending = false;
        startAfterSelection = false;
      }
      dependencies.cropWindow.hide();
      dependencies.statusWindow.update(
        publish({ state: 'failed', error: String(event.error || 'Quick Snip failed.') }),
      );
      return snapshot;
    }
    if (event.type === 'completed' && ['finalizing', 'recording'].includes(snapshot.state)) {
      dependencies.cropWindow.hide();
      const generation = selectionGeneration;
      const thumbnail = await dependencies.thumbnail?.(event.session).catch(() => null);
      if (generation !== selectionGeneration || !['finalizing', 'recording'].includes(snapshot.state)) return snapshot;
      publish({
        state: 'processing',
        progress: 0,
        job: { ...snapshot.job, projectId: event.session?.projectId ?? null, thumbnail },
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
          publish({ state: 'completed', progress: 1, result, copied, clipboardError, etaSeconds: 0 }),
        );
      } catch (error) {
        if (abort.signal.aborted || snapshot.state === 'canceled') return snapshot;
        dependencies.statusWindow.update(
          publish({ state: 'failed', error: error instanceof Error ? error.message : String(error) }),
        );
      } finally {
        if (processingAbort === abort) processingAbort = null;
      }
    }
    return snapshot;
  };
  return {
    toggle,
    configure,
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
