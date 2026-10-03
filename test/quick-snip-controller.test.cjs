const assert = require('node:assert/strict');
const test = require('node:test');
const { createQuickSnipController } = require('../apps/desktop/electron/quick-snip/quick-snip-controller.cjs');

const region = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
const preset = {
  id: 'default',
  name: 'Default',
  settings: {
    editor: {},
    devices: {},
    export: { format: 'mp4' },
    quickSnip: { automaticZoom: true },
  },
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

test('restart retains the Instant job and does not export the discarded take', async () => {
  const f = harness();
  await selectAndStart(f.controller, 'instant');
  await f.controller.report({ type: 'recording' });
  const job = f.controller.state().job;
  await f.controller.report({ type: 'restarting', name: job.name });
  assert.equal(f.controller.state().state, 'preparing');
  assert.deepEqual(f.controller.state().job, job);
  assert.equal(f.controller.state().progress, 0);
  assert.equal(f.finalizeCalls.length, 0);
  await f.controller.report({ type: 'recording' });
  assert.equal(f.controller.state().state, 'recording');
});

test('restart ignores an obsolete job and non-recording states', async () => {
  const f = harness();
  await selectAndStart(f.controller, 'instant');
  const job = f.controller.state().job;
  await f.controller.report({ type: 'restarting', name: job.name });
  assert.equal(f.controller.state().state, 'preparing');
  await f.controller.report({ type: 'recording' });
  await f.controller.report({ type: 'restarting', name: 'obsolete' });
  assert.equal(f.controller.state().state, 'recording');
  await f.controller.stop();
  await f.controller.report({ type: 'restarting', name: job.name });
  assert.equal(f.controller.state().state, 'finalizing');
});

test('late restart cannot revive a canceled recording', async () => {
  const f = harness();
  await selectAndStart(f.controller, 'instant');
  await f.controller.report({ type: 'recording' });
  const job = f.controller.state().job;
  await f.controller.cancel();
  await f.controller.report({ type: 'restarting', name: job.name });
  assert.equal(f.controller.state().state, 'canceled');
});

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
  selectSource,
  resolveDisplay,
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
  const paths = userPaths ?? {
    instantProjects: '/instant-projects',
    studioProjects: '/studio-projects',
  };
  const preferencesStore = {
    read: () => preferenceState,
    patch: (patch) => {
      calls.push('preferences.patch');
      if (patch.devices)
        preferenceState.devices = {
          ...preferenceState.devices,
          ...patch.devices,
        };
      if (patch.extras) preferenceState.extras = { ...preferenceState.extras, ...patch.extras };
    },
  };
  const videoPresetStore = {
    read: () => presetDocument ?? { activePresetId: 'default', presets: [preset] },
  };
  const stillPresetStore = {
    read: () =>
      screenshotPresetDocument ?? {
        activePresetId: 'default',
        presets: [preset],
      },
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
    selectSource: selectSource ?? (async (kind) => ({ id: 'native-display:1', kind })),
    cancelSourceSelection: () => calls.push('source.cancel'),
    resolveScreenId: async (display) => `native-display:${display.id}`,
    resolveDisplay: resolveDisplay ?? (() => ({ id: 1, bounds, workArea: bounds })),
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

test('Quick Snip inherits shared recording desktop and real cursor defaults', async () => {
  const f = harness({
    preferences: {
      extras: {
        hideTaskbar: true,
        hideDesktopIcons: true,
        showRealCursor: true,
      },
    },
  });
  await f.controller.toggle();
  const job = f.controller.state().job;
  assert.equal(job.hideTaskbar, true);
  assert.equal(job.hideDesktopIcons, true);
  assert.equal(job.showRealCursor, true);
});

test('Instant source options override the shared desktop and cursor defaults', async () => {
  const f = harness({
    preferences: {
      extras: {
        hideTaskbar: true,
        hideDesktopIcons: true,
        showRealCursor: true,
      },
    },
  });
  await f.controller.fromHud({
    screenKind: 'display',
    screenId: 'display:1',
    hideTaskbar: false,
    hideDesktopIcons: false,
    showRealCursor: false,
  });
  const job = f.controller.state().job;
  assert.equal(job.hideTaskbar, false);
  assert.equal(job.hideDesktopIcons, false);
  assert.equal(job.showRealCursor, false);
});

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
  await controller.report({
    type: 'completed',
    session: { projectId: 'project' },
  });
  assert.equal(controller.state().state, 'completed');
  assert.equal(controller.state().result.path, '/instant-projects/snippet.mp4');
  assert.equal(finalizeCalls[0].configuration.mode, 'instant');
  assert.ok(calls.includes('copy'));
});

test('opening Quick Snip shows only the toolbar, with no region or source chooser', async () => {
  const f = harness();
  await f.controller.toggle();
  assert.equal(f.selectCalls.length, 0);
  assert.equal(f.controller.state().job.region, null);
  assert.equal(f.controller.state().job.sourceReady, false);
  assert.equal(f.showCalls.length, 1);
});
test('the capture action opens the chosen region and confirmation starts the same job', async () => {
  const f = harness({ pendingSelection: true });
  await f.controller.toggle();
  const name = f.controller.state().job.name;
  await f.controller.chooseSource('region');
  const pending = f.controller.start();
  assert.equal(f.selectCalls[0].drawOnly, true);
  assert.equal(f.selectCalls[0].region, null);
  f.resolveSelection();
  await pending;
  assert.equal(f.controller.state().state, 'preparing');
  assert.equal(f.controller.state().job.name, name);
  assert.deepEqual(f.controller.state().job.region, region);
});
test('canceling a region returns to the existing toolbar without starting', async () => {
  const f = harness({ pendingSelection: true });
  await f.controller.toggle();
  await f.controller.chooseSource('region');
  const previous = f.controller.state().job;
  const pending = f.controller.start();
  f.resolveSelection(null);
  await pending;
  assert.equal(f.controller.state().state, 'selecting');
  assert.deepEqual(f.controller.state().job, previous);
  assert.equal(f.calls.includes('crop.start'), false);
});
test('a late region result cannot revive a canceled Quick Snip', async () => {
  const f = harness({ pendingSelection: true });
  await f.controller.toggle();
  await f.controller.chooseSource('region');
  const pending = f.controller.start();
  await f.controller.cancel();
  f.resolveSelection();
  await pending;
  assert.equal(f.controller.state().state, 'canceled');
  assert.equal(f.calls.includes('crop.start'), false);
});
for (const target of ['screen', 'window'])
  test(`selects ${target} defers its chooser and capture until Record is pressed`, async () => {
    const f = harness();
    await f.controller.toggle();
    await f.controller.chooseSource(target);
    assert.equal(f.controller.state().job.captureTarget, target);
    assert.equal(f.controller.state().job.sourceReady, false);
    assert.equal(f.controller.state().job.region, null);
    assert.equal(f.calls.includes('crop.start'), false);
    await f.controller.start();
    assert.equal(f.controller.state().state, 'preparing');
  });
for (const zoomMode of ['off', '2d', '3d'])
  test(`persists the shared ${zoomMode} zoom preference and countdown`, async () => {
    const f = harness();
    await f.controller.toggle();
    f.controller.configure({ zoomMode, countdownSeconds: 10 });
    assert.equal(f.controller.state().job.zoomMode, zoomMode);
    assert.equal(f.controller.state().job.automaticZoom, zoomMode !== 'off');
    assert.equal(f.preferenceState.extras.recordingZoomMode, zoomMode);
    assert.equal(f.preferenceState.extras.recordingCountdownSeconds, 10);
  });
test('rejects invalid source, countdown and zoom options', async () => {
  const f = harness();
  await f.controller.toggle();
  await assert.rejects(f.controller.chooseSource('anything'), /Invalid/);
  assert.throws(() => f.controller.configure({ zoomMode: '4d' }), /Invalid/);
  assert.throws(() => f.controller.configure({ countdownSeconds: 11 }), /Invalid/);
});
for (const target of ['screen', 'window', 'region'])
  test(`Linux ${target} uses the exact supported Portal source intent`, async () => {
    const f = harness({ platform: 'linux' });
    await f.controller.toggle();
    await f.controller.chooseSource(target);
    await f.controller.start();
    assert.equal(f.controller.state().job.screenId, target === 'window' ? 'portal:window' : 'portal:monitor');
    assert.equal(f.controller.state().job.screenKind, target === 'window' ? 'window' : 'display');
    assert.equal(f.controller.state().job.region !== null, target === 'region');
  });
test('uses the source kind selected inside the shared chooser rather than the original toolbar tab', async () => {
  const f = harness({ selectSource: async () => ({ id: 'wgc:window:123', kind: 'window' }) });
  await f.controller.toggle();
  await f.controller.chooseSource('screen');
  await f.controller.start();
  assert.equal(f.controller.state().job.captureTarget, 'window');
  assert.equal(f.controller.state().job.screenKind, 'window');
});
test('source cancellation retains the job and a late chooser result after cancellation cannot start capture', async () => {
  let finish;
  const f = harness({
    selectSource: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  await f.controller.toggle();
  await f.controller.chooseSource('window');
  const before = f.controller.state().job;
  let pending = f.controller.start();
  finish(null);
  await pending;
  assert.deepEqual(f.controller.state().job, before);
  await f.controller.chooseSource('window');
  pending = f.controller.start();
  await f.controller.cancel();
  finish({ id: 'wgc:window:123', kind: 'window' });
  await pending;
  assert.equal(f.controller.state().state, 'canceled');
  assert.ok(f.calls.includes('source.cancel'));
  assert.equal(f.calls.includes('crop.start'), false);
});
test('reopening the toolbar restores the saved zoom preference independently of the preset', async () => {
  const f = harness();
  await f.controller.toggle();
  f.controller.configure({ zoomMode: '3d' });
  await f.controller.cancel();
  await f.controller.toggle();
  assert.equal(f.controller.state().job.zoomMode, '3d');
  assert.equal(f.controller.state().job.automaticZoom, true);
});
test('opens on the remembered toolbar display rather than an older capture-region display', async () => {
  const requested = [];
  const f = harness({
    preferences: { extras: { quickSnipBarDisplayId: '2', quickSnipRegion: { displayId: '1' } } },
    resolveDisplay: (id) => {
      requested.push(id);
      return { id, bounds, workArea: bounds };
    },
  });
  await f.controller.toggle();
  assert.deepEqual(requested, ['2']);
  assert.equal(f.controller.state().job.displayId, '2');
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
  const completion = controller.report({
    type: 'completed',
    session: { projectId: 'project' },
  });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  await controller.cancel();
  assert.equal(controller.state().state, 'canceled');
  resolveFinalize({
    path: '/instant-projects/late-result.mp4',
    projectId: 'project',
  });
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
  const completion = controller.report({
    type: 'completed',
    session: { projectId: 'project' },
  });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  calls.length = 0;
  await controller.cancel({ keepStatus: true });
  assert.equal(controller.state().state, 'canceled');
  assert.equal(finalizeSignal.aborted, true);
  assert.ok(calls.includes('crop.hide'));
  assert.equal(calls.includes('status.hide'), false);

  resolveFinalize({
    path: '/instant-projects/late-result.mp4',
    projectId: 'project',
  });
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
  const completion = controller.report({
    type: 'completed',
    session: { projectId: 'project' },
  });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  await controller.cancel();
  assert.equal(controller.state().state, 'canceled');
  calls.length = 0;

  await controller.report({ type: 'failed', error: 'late failure' });
  await controller.report({
    type: 'completed',
    session: { projectId: 'late-project' },
  });

  assert.equal(controller.state().state, 'canceled');
  assert.equal(controller.state().result, null);
  assert.equal(controller.state().error, null);
  assert.equal(
    calls.some((call) => call === 'status.show' || call.startsWith('status.')),
    false,
  );

  resolveFinalize({
    path: '/instant-projects/late-result.mp4',
    projectId: 'project',
  });
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
  const pending = f.controller.report({
    type: 'completed',
    session: { projectId: 'project' },
  });
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
  await f.controller.report({
    type: 'completed',
    session: { projectId: 'project' },
  });
  assert.equal(f.controller.state().state, 'completed');
  assert.equal(f.controller.state().copied, false);
  assert.equal(f.controller.state().clipboardError, 'Clipboard busy');
  assert.ok(f.controller.state().result.path);
});
