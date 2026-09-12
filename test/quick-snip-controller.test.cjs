const assert = require('node:assert/strict');
const test = require('node:test');
const { createQuickSnipController } = require('../electron/quick-snip/quick-snip-controller.cjs');

const region = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
const preset = {
  id: 'default',
  name: 'Default',
  settings: { editor: {}, devices: {}, export: { format: 'mp4' }, quickSnip: { automaticZoom: true } },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function harness({
  normalRecording = false,
  pendingSelection = false,
  selectionPlans,
  selectionFailure,
  platform = 'win32',
  showFailure,
  finalize,
  thumbnail,
  copyFile,
  preferences,
  presetDocument,
  screenshotPresetDocument,
  userPaths,
  openEditor,
  openScreenshot,
} = {}) {
  const calls = [];
  const preferenceState = preferences ?? { extras: {} };
  const selectionOverlayWindows = [{ id: 'selection-overlay-1' }, { id: 'selection-overlay-2' }];
  const pendingSelections = [];
  let selectionIndex = 0;
  let activeSelection = null;
  const showCalls = [];
  const selectCalls = [];
  const configurationUpdates = [];
  const finalizeCalls = [];
  const editorCalls = [];
  const screenshotCalls = [];
  const paths = userPaths ?? { instantProjects: '/instant-projects', studioProjects: '/studio-projects' };
  const preferencesStore = {
    read: () => preferenceState,
    patch: (patch) => {
      calls.push('preferences.patch');
      if (patch.devices) preferenceState.devices = { ...preferenceState.devices, ...patch.devices };
      if (patch.extras) preferenceState.extras = { ...preferenceState.extras, ...patch.extras };
    },
  };
  const videoPresetStore = { read: () => presetDocument ?? { activePresetId: 'default', presets: [preset] } };
  const stillPresetStore = {
    read: () => screenshotPresetDocument ?? { activePresetId: 'default', presets: [preset] },
  };
  let cropParent = null;
  let showFailuresRemaining = showFailure ? 1 : 0;
  const defaultPlan = pendingSelection
    ? { pending: true }
    : selectionFailure
      ? { failure: selectionFailure }
      : { value: { bounds, region } };
  const nextSelection = () => {
    const plan = selectionPlans?.[selectionIndex] ?? defaultPlan;
    const overlayWindow = selectionOverlayWindows[Math.min(selectionIndex, selectionOverlayWindows.length - 1)];
    selectionIndex += 1;
    activeSelection = overlayWindow;
    if (plan?.pending) {
      const current = deferred();
      pendingSelections.push(current);
      return current.promise;
    }
    if (plan?.failure) {
      if (plan.failure.timing === 'sync') throw plan.failure.error;
      return Promise.reject(plan.failure.error);
    }
    return Promise.resolve(plan?.value ?? { bounds, region });
  };
  const cropWindow = {
    hide: () => calls.push('crop.hide'),
    show: (...args) => {
      calls.push('crop.show');
      showCalls.push(args);
      cropParent = args[2] ?? null;
      if (showFailuresRemaining > 0) {
        showFailuresRemaining -= 1;
        throw showFailure;
      }
    },
    setParentWindow: (parent) => {
      cropParent = parent;
      calls.push(`crop.parent:${parent ? parent.id : 'none'}`);
    },
    updateConfiguration: (configuration) => {
      calls.push('crop.updateConfiguration');
      configurationUpdates.push(configuration);
    },
    command: (command) => calls.push(`crop.${command}`),
    setRecording: (active) => calls.push(`crop.recording:${active}`),
  };
  const statusWindow = {
    hide: () => calls.push('status.hide'),
    update: (value) => calls.push(`status.${value.state}`),
    show: () => calls.push('status.show'),
  };
  const regionOverlay = {
    select: (options) => {
      selectCalls.push(options);
      return nextSelection();
    },
    nativeWindow: () => activeSelection,
    cancel: () => calls.push('selection.cancel'),
    confirmCurrent: () => {
      calls.push('selection.confirm');
      pendingSelections.at(-1)?.resolve({ bounds, region });
    },
  };
  const controller = createQuickSnipController({
    userPaths: paths,
    preferencesStore,
    presetStore: videoPresetStore,
    screenshotPresetStore: stillPresetStore,
    openEditor: async (id) => {
      editorCalls.push(id);
      calls.push(`editor:${id}`);
      return openEditor?.(id);
    },
    openScreenshot: async (id) => {
      screenshotCalls.push(id);
      calls.push(`screenshot:${id}`);
      return openScreenshot?.(id);
    },
    projectStore: {},
    regionOverlay,
    cropWindow,
    statusWindow,
    platform,
    resolveScreenId: async (display) => `native-display:${display.id}`,
    resolveDisplay: () => ({ id: 1, bounds, workArea: bounds }),
    isNormalRecordingActive: () => normalRecording,
    finalize: async (options) => {
      finalizeCalls.push(options);
      if (finalize) return finalize(options);
      options.onProgress?.(0.5);
      return { path: '/instant-projects/snippet.mp4', projectId: 'project' };
    },
    thumbnail,
    copyFile: copyFile ?? (() => calls.push('copy')),
  });
  return {
    controller,
    calls,
    preferenceState,
    finalizeCalls,
    editorCalls,
    screenshotCalls,
    selectionOverlayWindow: selectionOverlayWindows[0],
    selectionOverlayWindows,
    showCalls,
    selectCalls,
    configurationUpdates,
    pendingSelections,
    resolveSelection: (value = { bounds, region }) => pendingSelections.at(-1)?.resolve(value),
    rejectSelection: (error) => pendingSelections.at(-1)?.reject(error),
    cropParent: () => cropParent,
  };
}

async function selectAndStart(controller, mode = 'studio') {
  await controller.toggle();
  if (mode !== 'studio') await controller.configure({ mode });
  await controller.toggle();
}

test('one toggle selects, starts, stops and finalizes Instant Quick Snip according to state', async () => {
  const { controller, calls, finalizeCalls } = harness();
  assert.equal(controller.state().state, 'idle');
  await controller.toggle();
  assert.equal(controller.state().state, 'selecting');
  await controller.configure({ mode: 'instant' });
  await controller.toggle();
  assert.equal(controller.state().state, 'preparing');
  assert.ok(calls.includes('crop.start'));
  await controller.report({ type: 'recording' });
  assert.equal(controller.state().state, 'recording');
  await controller.toggle();
  assert.equal(controller.state().state, 'finalizing');
  await controller.report({ type: 'completed', session: { projectId: 'project' } });
  assert.equal(controller.state().state, 'completed');
  assert.equal(controller.state().result.path, '/instant-projects/snippet.mp4');
  assert.equal(finalizeCalls[0].configuration.mode, 'instant');
  assert.ok(calls.includes('copy'));
});

test('toggle confirms a pending selection and starts without a countdown', async () => {
  const { controller, calls } = harness({ pendingSelection: true });
  void controller.toggle();
  await Promise.resolve();
  assert.equal(controller.state().state, 'selecting');
  assert.ok(calls.includes('crop.show'));
  await controller.toggle();
  await Promise.resolve();
  const confirmationIndex = calls.indexOf('selection.confirm');
  const startIndex = calls.indexOf('crop.start');
  assert.ok(confirmationIndex >= 0);
  assert.ok(startIndex > confirmationIndex);
  assert.deepEqual(controller.state().job.region, region);
  assert.equal(controller.state().state, 'preparing');
});

test('passes the selection overlay parent to Crop Bar show and detaches it before confirming the region', async () => {
  const { controller, calls, showCalls, selectionOverlayWindow } = harness({ pendingSelection: true });

  void controller.toggle();
  await Promise.resolve();
  assert.equal(showCalls[0][2], selectionOverlayWindow);
  assert.equal(calls.includes('crop.parent:selection-overlay-1'), false);

  await controller.toggle();
  const detachIndex = calls.indexOf('crop.parent:none');
  const confirmationIndex = calls.indexOf('selection.confirm');
  assert.ok(detachIndex >= 0);
  assert.ok(confirmationIndex > detachIndex);
});

test('preserves start overrides through pending selection confirmation', async () => {
  const f = harness({ pendingSelection: true });
  const overrides = {
    automaticZoom: false,
    devices: { micId: 'mic-custom', cameraId: 'camera-custom', systemAudioMode: 'on' },
  };

  void f.controller.toggle();
  await Promise.resolve();
  await f.controller.start(overrides);
  await new Promise((resolve) => setImmediate(resolve));

  const snapshot = f.controller.state();
  assert.equal(snapshot.state, 'preparing');
  assert.equal(snapshot.job.mode, 'studio');
  assert.equal(snapshot.job.format, 'mp4');
  assert.equal(snapshot.job.automaticZoom, false);
  assert.deepEqual(snapshot.job.devices, overrides.devices);
  assert.equal(snapshot.job.outputRoot, '/instant-projects');
});

test('updates the confirmed job before sending the start command', async () => {
  const f = harness();

  await f.controller.toggle();
  await f.controller.configure({ mode: 'instant', automaticZoom: false });
  await f.controller.start();

  const updateIndex = f.calls.lastIndexOf('crop.updateConfiguration');
  const startIndex = f.calls.lastIndexOf('crop.start');
  assert.ok(updateIndex >= 0);
  assert.ok(updateIndex < startIndex);
  assert.deepEqual(f.configurationUpdates.at(-1), f.controller.state().job);
  assert.equal(f.configurationUpdates.at(-1).outputRoot, '/instant-projects');
  assert.equal(f.configurationUpdates.at(-1).automaticZoom, false);
});

for (const platform of ['win32', 'darwin']) {
  test(`${platform} Quick Snip keeps display capture and region selection`, async () => {
    const f = harness({ platform });

    await f.controller.toggle();
    const snapshot = f.controller.state();
    assert.equal(snapshot.state, 'selecting');
    assert.equal(snapshot.job.screenKind, 'display');
    assert.notEqual(snapshot.job.region, null);
    assert.equal(f.selectCalls.length, 1);

    await f.controller.toggle();
    assert.equal(f.controller.state().state, 'preparing');
    assert.equal(f.controller.state().job.screenKind, 'display');
  });
}

test('Linux Quick Snip captures the portal window without opening a region overlay', async () => {
  const f = harness({ platform: 'linux' });

  await f.controller.toggle();
  const selecting = f.controller.state();
  assert.equal(selecting.state, 'selecting');
  assert.equal(selecting.job.screenKind, 'window');
  assert.equal(selecting.job.screenId, 'portal:window');
  assert.equal(selecting.job.region, null);
  assert.deepEqual(selecting.job.regionBounds, bounds);
  assert.equal(selecting.job.displayId, '1');
  assert.equal(f.selectCalls.length, 0);
  assert.equal(f.calls.includes('preferences.patch'), false);
  assert.equal(f.showCalls.length, 1);
  assert.equal(f.showCalls[0][0].region, null);
  assert.equal(f.showCalls[0][0].regionBounds, bounds);

  await f.controller.toggle();
  assert.equal(f.controller.state().state, 'preparing');
  assert.equal(f.controller.state().job.screenKind, 'window');
  assert.equal(f.controller.state().job.screenId, 'portal:window');
  assert.equal(f.controller.state().job.region, null);
  assert.ok(f.calls.includes('crop.start'));

  await f.controller.report({ type: 'recording' });
  await f.controller.stop();
  assert.equal(f.controller.state().state, 'finalizing');
  assert.ok(f.calls.includes('crop.stop'));
});

test('Linux Quick Snip cancel hides the Crop Bar and the next toggle retries window selection', async () => {
  const f = harness({ platform: 'linux' });

  await f.controller.toggle();
  await f.controller.cancel();
  assert.equal(f.controller.state().state, 'canceled');
  assert.ok(f.calls.includes('crop.hide'));
  assert.equal(f.selectCalls.length, 0);

  const showsBeforeRetry = f.showCalls.length;
  await f.controller.toggle();
  assert.equal(f.controller.state().state, 'selecting');
  assert.equal(f.controller.state().job.screenKind, 'window');
  assert.equal(f.showCalls.length, showsBeforeRetry + 1);
  assert.equal(f.selectCalls.length, 0);
});

test('Linux Quick Snip failure hides the Crop Bar and the next toggle retries', async () => {
  const f = harness({ platform: 'linux' });

  await f.controller.toggle();
  await f.controller.report({ type: 'failed', error: 'window capture failed' });
  assert.equal(f.controller.state().state, 'failed');
  assert.equal(f.controller.state().error, 'window capture failed');
  assert.ok(f.calls.includes('crop.hide'));
  assert.ok(f.calls.includes('status.failed'));
  assert.equal(f.selectCalls.length, 0);

  await f.controller.toggle();
  assert.equal(f.controller.state().state, 'selecting');
  assert.equal(f.controller.state().job.screenKind, 'window');
  assert.equal(f.selectCalls.length, 0);
});

test('Linux Crop Bar show failure becomes a retryable Quick Snip error', async () => {
  const failure = new Error('Crop Bar unavailable');
  const f = harness({ platform: 'linux', showFailure: failure });

  await f.controller.toggle();
  assert.equal(f.controller.state().state, 'failed');
  assert.equal(f.controller.state().error, failure.message);
  assert.ok(f.calls.includes('crop.hide'));
  assert.ok(f.calls.includes('status.failed'));
  assert.equal(f.selectCalls.length, 0);

  await f.controller.toggle();
  assert.equal(f.controller.state().state, 'selecting');
  assert.equal(f.controller.state().job.screenKind, 'window');
  assert.equal(f.selectCalls.length, 0);
});

for (const timing of ['sync', 'async']) {
  test(`selection ${timing} rejection fails visibly and allows a retry`, async () => {
    const error = new Error(`${timing} selection failure`);
    const f = harness({
      selectionPlans: [{ failure: { timing, error } }, { value: { bounds, region } }],
    });

    await f.controller.toggle();
    assert.equal(f.controller.state().state, 'failed');
    assert.equal(f.controller.state().error, error.message);
    assert.ok(f.calls.includes('selection.cancel'));
    assert.ok(f.calls.includes('crop.hide'));
    assert.ok(f.calls.includes('status.failed'));

    const showsBeforeRetry = f.showCalls.length;
    await f.controller.toggle();
    assert.equal(f.controller.state().state, 'selecting');
    assert.equal(f.controller.state().error, null);
    assert.equal(f.showCalls.length, showsBeforeRetry + 1);
  });
}

test('a failed selection clears the overlay and ignores its late resolution', async () => {
  const f = harness({ pendingSelection: true });
  const selection = f.controller.toggle();
  await Promise.resolve();
  const updatesBeforeFailure = f.configurationUpdates.length;

  await f.controller.report({ type: 'failed', error: 'selection failed' });
  assert.equal(f.controller.state().state, 'failed');
  assert.equal(f.controller.state().error, 'selection failed');
  assert.equal(f.cropParent(), null);
  assert.ok(f.calls.includes('selection.cancel'));
  assert.ok(f.calls.includes('crop.hide'));
  assert.ok(f.calls.includes('status.failed'));

  const callsAfterFailure = [...f.calls];
  f.resolveSelection();
  await selection;

  assert.equal(f.controller.state().state, 'failed');
  assert.deepEqual(f.calls, callsAfterFailure);
  assert.equal(f.configurationUpdates.length, updatesBeforeFailure);
});

test('a stale selection cannot detach the Crop Bar parent of a newer session', async () => {
  const f = harness({ selectionPlans: [{ pending: true }, { pending: true }] });
  const firstSelection = f.controller.toggle();
  await Promise.resolve();
  assert.equal(f.cropParent(), f.selectionOverlayWindows[0]);

  await f.controller.cancel();
  const secondSelection = f.controller.toggle();
  await Promise.resolve();
  const secondShowIndex = f.calls.lastIndexOf('crop.show');
  assert.equal(f.cropParent(), f.selectionOverlayWindows[1]);

  f.pendingSelections[0].resolve({ bounds, region });
  await firstSelection;

  assert.equal(f.controller.state().state, 'selecting');
  assert.equal(f.cropParent(), f.selectionOverlayWindows[1]);
  assert.equal(f.calls.slice(secondShowIndex + 1).includes('crop.parent:none'), false);

  f.pendingSelections[1].resolve({ bounds, region });
  await secondSelection;
});

test('preparing toggle cancels while Instant processing toggle only restores status', async () => {
  const { controller, calls } = harness();
  await selectAndStart(controller, 'instant');
  await controller.toggle();
  assert.equal(controller.state().state, 'canceled');
  assert.ok(calls.includes('crop.cancel'));
  assert.equal(calls.filter((call) => call === 'status.hide').length, 2);
  assert.equal(controller.state().progress, 0);

  await selectAndStart(controller, 'instant');
  await controller.report({ type: 'recording' });
  await controller.stop();
  const completion = controller.report({ type: 'completed', session: {} });
  await controller.toggle();
  assert.ok(calls.includes('status.show'));
  await completion;
});

test('normal Beam recording prevents Quick Snip selection', async () => {
  const { controller, calls } = harness({ normalRecording: true });
  await assert.rejects(controller.toggle(), /Beam recording/);
  assert.equal(controller.state().state, 'idle');
  assert.deepEqual(calls, []);
});

test('a late processing result cannot replace canceled state or copy a file', async () => {
  let resolveFinalize;
  const finalize = () =>
    new Promise((resolve) => {
      resolveFinalize = resolve;
    });
  const { controller, calls } = harness({ finalize });

  await selectAndStart(controller, 'instant');
  await controller.report({ type: 'recording' });
  await controller.stop();
  const completion = controller.report({ type: 'completed', session: { projectId: 'project' } });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  await controller.cancel();
  assert.equal(controller.state().state, 'canceled');
  resolveFinalize({ path: '/instant-projects/late-result.mp4', projectId: 'project' });
  await completion;

  assert.equal(controller.state().state, 'canceled');
  assert.equal(controller.state().result, null);
  assert.equal(calls.includes('copy'), false);
});

test('cancels an Instant export without hiding its status window', async () => {
  let resolveFinalize;
  let finalizeSignal;
  const finalize = ({ signal }) => {
    finalizeSignal = signal;
    return new Promise((resolve) => {
      resolveFinalize = resolve;
    });
  };
  const { controller, calls } = harness({ finalize });

  await selectAndStart(controller, 'instant');
  await controller.report({ type: 'recording' });
  await controller.stop();
  const completion = controller.report({ type: 'completed', session: { projectId: 'project' } });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  calls.length = 0;
  await controller.cancel({ keepStatus: true });
  assert.equal(controller.state().state, 'canceled');
  assert.equal(finalizeSignal.aborted, true);
  assert.ok(calls.includes('crop.hide'));
  assert.equal(calls.includes('status.hide'), false);

  resolveFinalize({ path: '/instant-projects/late-result.mp4', projectId: 'project' });
  await completion;
  assert.equal(controller.state().state, 'canceled');
  assert.equal(calls.includes('copy'), false);
  assert.equal(calls.includes('status.hide'), false);
});

test('late failed and completed reports after cancel do not reopen the status window', async () => {
  let resolveFinalize;
  const finalize = () =>
    new Promise((resolve) => {
      resolveFinalize = resolve;
    });
  const { controller, calls } = harness({ finalize });

  await selectAndStart(controller, 'instant');
  await controller.report({ type: 'recording' });
  await controller.stop();
  const completion = controller.report({ type: 'completed', session: { projectId: 'project' } });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  await controller.cancel();
  assert.equal(controller.state().state, 'canceled');
  calls.length = 0;

  await controller.report({ type: 'failed', error: 'late failure' });
  await controller.report({ type: 'completed', session: { projectId: 'late-project' } });

  assert.equal(controller.state().state, 'canceled');
  assert.equal(controller.state().result, null);
  assert.equal(controller.state().error, null);
  assert.equal(
    calls.some((call) => call === 'status.show' || call.startsWith('status.')),
    false,
  );

  resolveFinalize({ path: '/instant-projects/late-result.mp4', projectId: 'project' });
  await completion;
});

test('cancellation while awaiting a thumbnail cannot restart processing', async () => {
  let finishThumbnail;
  const thumbnail = () =>
    new Promise((resolve) => {
      finishThumbnail = resolve;
    });
  const f = harness({ thumbnail });
  await selectAndStart(f.controller, 'instant');
  await f.controller.report({ type: 'recording' });
  const pending = f.controller.report({ type: 'completed', session: { projectId: 'project' } });
  await f.controller.cancel();
  finishThumbnail(null);
  await pending;
  assert.equal(f.controller.state().state, 'canceled');
  assert.equal(f.calls.includes('status.processing'), false);
});

test('clipboard failure preserves the completed output and exposes a retryable error', async () => {
  const f = harness({
    copyFile: async () => {
      throw new Error('Clipboard busy');
    },
  });
  await selectAndStart(f.controller, 'instant');
  await f.controller.report({ type: 'recording' });
  await f.controller.report({ type: 'completed', session: { projectId: 'project' } });
  assert.equal(f.controller.state().state, 'completed');
  assert.equal(f.controller.state().copied, false);
  assert.equal(f.controller.state().clipboardError, 'Clipboard busy');
  assert.ok(f.controller.state().result.path);
});
