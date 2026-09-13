const assert = require('node:assert/strict');
const test = require('node:test');
const { createQuickSnipController } = require('../electron/quick-snip/quick-snip-controller.cjs');

const displayBounds = { x: 0, y: 0, width: 1920, height: 1080 };
const selectionRegion = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
const screenshotId = '11111111-1111-4111-8111-111111111111';

function makePreset(id, { format = 'mp4', automaticZoom = true, devices = {} } = {}) {
  return {
    id,
    name: id,
    settings: { devices, export: { format }, quickSnip: { automaticZoom } },
  };
}

function fixture({
  preferences = { extras: {} },
  videoPreset,
  screenshotPreset,
  finalize,
  openEditorAction,
  openScreenshotAction,
  display = { id: 2, bounds: displayBounds, workArea: displayBounds },
  resolveScreenId = async (selectedDisplay) => `native-display:${selectedDisplay.id}`,
} = {}) {
  const calls = [];
  const selectionCalls = [];
  const shownConfigurations = [];
  const preferenceWrites = [];
  const openEditors = [];
  const openScreenshots = [];
  const finalized = [];
  const preferenceState = preferences;
  const activeVideoPreset = videoPreset ?? makePreset('default');
  const activeScreenshotPreset = screenshotPreset ?? makePreset('screenshot-default');
  const dependencies = {
    platform: 'win32',
    userPaths: { instantProjects: '/projects/instant', studioProjects: '/projects/studio' },
    preferencesStore: {
      read: () => preferenceState,
      patch: (patch) => {
        preferenceWrites.push(patch);
        if (patch.extras) preferenceState.extras = { ...preferenceState.extras, ...patch.extras };
        if (patch.devices) preferenceState.devices = { ...preferenceState.devices, ...patch.devices };
      },
    },
    presetStore: { read: () => ({ activePresetId: activeVideoPreset.id, presets: [activeVideoPreset] }) },
    screenshotStore: {
      read: (id) => {
        assert.equal(id, screenshotId);
        return { id, source: `project-media://screenshot/${id}/source.png` };
      },
    },
    screenshotPresetStore: {
      read: () => ({ activePresetId: activeScreenshotPreset.id, presets: [activeScreenshotPreset] }),
    },
    openEditor: async (id) => {
      openEditors.push(id);
      return openEditorAction?.(id);
    },
    openScreenshot: async (id) => {
      openScreenshots.push(id);
      return openScreenshotAction?.(id);
    },
    projectStore: {},
    regionOverlay: {
      select: (options) => {
        selectionCalls.push(options);
        return Promise.resolve({ bounds: displayBounds, region: selectionRegion });
      },
      cancel: () => calls.push('selection.cancel'),
    },
    cropWindow: {
      show: (configuration) => shownConfigurations.push(configuration),
      hide: () => calls.push('crop.hide'),
      showExisting: () => calls.push('crop.showExisting'),
      updateConfiguration: (configuration) => shownConfigurations.push(configuration),
      updateRegion: () => {},
      setParentWindow: () => {},
      command: (command) => calls.push(`crop.${command}`),
      setRecording: () => {},
    },
    statusWindow: {
      prepare: () => calls.push('status.prepare'),
      hide: () => calls.push('status.hide'),
      show: () => calls.push('status.show'),
      update: (state) => calls.push(`status.${state.state}`),
    },
    resolveScreenId: (selectedDisplay) => resolveScreenId(selectedDisplay),
    resolveDisplay: () => display,
    isNormalRecordingActive: () => false,
    finalize: async (options) => {
      finalized.push(options);
      return finalize
        ? finalize(options)
        : { path: '/projects/instant/exports/quick-snip.mp4', projectId: options.session.projectId };
    },
    copyFile: async (file) => calls.push(`copy:${file}`),
    onStateChanged: (state) => calls.push(`state:${state.state}`),
  };
  const controller = createQuickSnipController(dependencies);
  return {
    controller,
    calls,
    selectionCalls,
    shownConfigurations,
    preferenceWrites,
    openEditors,
    openScreenshots,
    finalized,
    preferenceState,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('Studio is the first-run Quick Snip choice and records in Instant storage', async () => {
  const f = fixture();

  await f.controller.toggle();
  assert.equal(f.controller.state().job.mode, 'studio');
  assert.equal(f.controller.state().job.preset.id, 'default');
  assert.equal(f.preferenceState.extras.captureMode, undefined);
  await f.controller.start();

  assert.equal(f.controller.state().job.outputRoot, '/projects/instant');
});

test('accepts only Studio, Instant, and Screenshot mode values', async () => {
  const f = fixture({ screenshotPreset: makePreset('still-active') });
  await f.controller.toggle();

  assert.throws(() => f.controller.configure({ mode: 'raw' }), /invalid capture mode/i);
  assert.throws(() => f.controller.configure({ mode: 'video' }), /invalid capture mode/i);
  assert.equal(f.controller.state().job.mode, 'studio');
  assert.equal(
    f.preferenceWrites.some((patch) => patch.extras?.captureMode),
    false,
  );

  await f.controller.configure({ mode: 'screenshot' });
  assert.equal(f.controller.state().job.mode, 'screenshot');
  assert.equal(f.controller.state().job.preset.id, 'still-active');
  await f.controller.configure({ mode: 'instant' });
  assert.equal(f.controller.state().job.mode, 'instant');
  assert.equal(f.controller.state().job.preset.id, 'default');
});

for (const presetId of ['default', 'saved-video']) {
  test(`Screenshot to Studio restores ${presetId} devices and zoom without overwriting preferences`, async () => {
    const devices = { micId: 'mic-usb', cameraId: 'camera-usb', systemAudioMode: 'on' };
    const f = fixture({
      preferences: { extras: { captureMode: 'screenshot' }, devices: { ...devices } },
      videoPreset: makePreset(presetId, { devices, automaticZoom: true }),
    });
    await f.controller.toggle();
    f.controller.configure({
      mode: 'studio',
      devices: { micId: 'default', cameraId: 'off', systemAudioMode: 'off' },
      automaticZoom: false,
    });
    assert.deepEqual(f.controller.state().job.devices, devices);
    assert.equal(f.controller.state().job.automaticZoom, true);
    assert.deepEqual(f.preferenceState.devices, devices);
    assert.ok(f.preferenceWrites.every((patch) => !patch.devices));
    await f.controller.start();
    assert.deepEqual(f.controller.state().job.preset.settings.devices, devices);
  });
}

test('fromHud starts Instant immediately with the chosen source, active preset, and native project root', async () => {
  const devices = { micId: 'mic-1', cameraId: 'camera-1', systemAudioMode: 'on' };
  const f = fixture({
    preferences: { extras: { captureMode: 'studio' } },
    videoPreset: makePreset('video-active', { format: 'webm', automaticZoom: false }),
  });

  await f.controller.fromHud({
    screenKind: 'window',
    screenId: 'window:48',
    region: null,
    devices,
  });

  const { state, job } = f.controller.state();
  assert.equal(state, 'preparing');
  assert.equal(job.mode, 'instant');
  assert.equal(job.screenKind, 'window');
  assert.equal(job.screenId, 'window:48');
  assert.equal(job.region, null);
  assert.equal(job.preset.id, 'video-active');
  assert.equal(job.format, 'webm');
  assert.equal(job.automaticZoom, false);
  assert.deepEqual(job.devices, devices);
  assert.equal(job.outputRoot, '/projects/instant');
  assert.equal(f.selectionCalls.length, 0);
  assert.equal(f.shownConfigurations[0].mode, 'instant');
  assert.ok(f.calls.includes('crop.start'));
  assert.deepEqual(f.preferenceWrites.at(-1), { extras: { captureMode: 'instant' } });
});

test('fromHud rejects a source outside the native display and window options', async () => {
  const f = fixture();

  await assert.rejects(
    f.controller.fromHud({ screenKind: 'application', screenId: 'app:17' }),
    /invalid Instant capture source/i,
  );

  assert.equal(f.controller.state().state, 'idle');
  assert.equal(f.shownConfigurations.length, 0);
  assert.equal(f.selectionCalls.length, 0);
});

test('Quick Snip uses the native source resolved for its selected display instead of a stale saved source ID', async () => {
  const display = { id: 22, bounds: { x: -1920, y: -120, width: 1920, height: 1080 }, workArea: displayBounds };
  const resolvedDisplays = [];
  const f = fixture({
    preferences: {
      extras: {
        captureMode: 'studio',
        quickSnipScreenId: 'wgc:monitor:stale-display',
        quickSnipRegion: { displayId: '22', region: selectionRegion },
      },
    },
    display,
    resolveScreenId: async (selectedDisplay) => {
      resolvedDisplays.push(selectedDisplay);
      return 'wgc:monitor:\\\\.\\DISPLAY2';
    },
  });

  await f.controller.toggle();
  assert.equal(f.controller.state().job.screenId, undefined);
  assert.deepEqual(f.selectionCalls[0].bounds, display.bounds);
  await f.controller.start();

  const sentConfiguration = f.shownConfigurations.at(-1);
  assert.deepEqual(resolvedDisplays, [display]);
  assert.equal(sentConfiguration.displayId, '22');
  assert.equal(sentConfiguration.screenId, 'wgc:monitor:\\\\.\\DISPLAY2');
  assert.notEqual(sentConfiguration.screenId, f.preferenceState.extras.quickSnipScreenId);
  assert.ok(f.calls.includes('crop.start'));
});

test('cancellation while the selected display source is resolving never starts native capture', async () => {
  const resolution = deferred();
  const f = fixture({ resolveScreenId: () => resolution.promise });
  await f.controller.toggle();
  const configurationCount = f.shownConfigurations.length;

  const starting = f.controller.start();
  await Promise.resolve();
  assert.equal(f.controller.state().state, 'preparing');
  assert.ok(!f.calls.includes('crop.start'));

  await f.controller.cancel();
  resolution.resolve('wgc:monitor:late-display');
  await starting;

  assert.equal(f.controller.state().state, 'canceled');
  assert.ok(!f.calls.includes('crop.start'));
  assert.equal(f.shownConfigurations.length, configurationCount);
});

test('a selected display source resolution failure remains visible and never starts native capture', async () => {
  const f = fixture({
    resolveScreenId: async () => {
      throw new Error('display mapping unavailable');
    },
  });
  await f.controller.toggle();
  const configurationCount = f.shownConfigurations.length;

  await f.controller.start();

  assert.equal(f.controller.state().state, 'failed');
  assert.match(f.controller.state().error, /display mapping unavailable/);
  assert.ok(!f.calls.includes('crop.start'));
  assert.equal(f.shownConfigurations.length, configurationCount);
  assert.ok(f.calls.includes('status.failed'));
});

test('Studio and HUD Instant both finalize, export and copy without opening an editor', async () => {
  const studio = fixture();
  await studio.controller.toggle();
  await studio.controller.start();
  await studio.controller.report({ type: 'recording' });
  await studio.controller.report({ type: 'completed', session: { projectId: 'studio-project' } });

  assert.deepEqual(studio.openEditors, []);
  assert.equal(studio.finalized[0].configuration.outputRoot, '/projects/instant');
  assert.ok(studio.calls.includes('copy:/projects/instant/exports/quick-snip.mp4'));
  assert.equal(studio.finalized.length, 1);
  assert.equal(studio.controller.state().state, 'completed');

  const instant = fixture();
  await instant.controller.fromHud({ screenKind: 'display', screenId: 'display:2' });
  await instant.controller.report({ type: 'recording' });
  await instant.controller.report({ type: 'completed', session: { projectId: 'instant-project' } });

  assert.equal(instant.finalized.length, 1);
  assert.equal(instant.finalized[0].configuration.mode, 'instant');
  assert.equal(instant.finalized[0].configuration.outputRoot, '/projects/instant');
  assert.equal(instant.controller.state().state, 'completed');
  assert.equal(instant.controller.state().result.projectId, 'instant-project');
  assert.ok(instant.calls.some((call) => call === 'copy:/projects/instant/exports/quick-snip.mp4'));
});

test('Screenshot completion retains its ID and copies by default or opens the screenshot editor', async () => {
  const copied = fixture({
    preferences: { extras: { captureMode: 'screenshot' } },
    screenshotPreset: makePreset('still-active'),
  });
  await copied.controller.toggle();
  await copied.controller.start();
  await copied.controller.report({ type: 'screenshot', name: copied.controller.state().job.name, screenshotId });

  assert.equal(copied.controller.state().state, 'completed');
  assert.equal(copied.controller.state().job.projectId, screenshotId);
  assert.deepEqual(copied.controller.state().result, { path: '', projectId: screenshotId });
  assert.equal(copied.controller.state().copied, true);
  assert.equal(copied.controller.state().preview, null);
  assert.deepEqual(copied.openScreenshots, []);

  const edited = fixture({ preferences: { extras: { captureMode: 'screenshot' } } });
  await edited.controller.toggle();
  await edited.controller.configure({ screenshotAction: 'edit' });
  await edited.controller.start();
  assert.equal(edited.controller.state().job.mode, 'screenshot');
  assert.equal(edited.controller.state().job.screenshotAction, 'edit');
  await edited.controller.report({ type: 'screenshot', name: edited.controller.state().job.name, screenshotId });

  assert.equal(edited.controller.state().state, 'completed');
  assert.equal(edited.controller.state().copied, false);
  assert.equal(edited.controller.state().result.projectId, screenshotId);
  assert.deepEqual(edited.openScreenshots, [screenshotId]);
});

test('keeps Screenshot capture failed when opening its editor fails', async () => {
  const f = fixture({
    preferences: { extras: { captureMode: 'screenshot' } },
    openScreenshotAction: async () => {
      throw new Error('Screenshot editor unavailable');
    },
  });

  await f.controller.toggle();
  await f.controller.configure({ screenshotAction: 'edit' });
  await f.controller.start();
  await f.controller.report({ type: 'screenshot', name: f.controller.state().job.name, screenshotId });

  assert.equal(f.controller.state().state, 'failed');
  assert.match(f.controller.state().error, /Screenshot editor unavailable/);
  assert.deepEqual(f.openScreenshots, [screenshotId]);
  assert.ok(f.calls.includes('status.failed'));
});

test('ignores a late screenshot editor result after capture cancellation', async () => {
  const opening = deferred();
  const f = fixture({
    preferences: { extras: { captureMode: 'screenshot' } },
    openScreenshotAction: () => opening.promise,
  });

  await f.controller.toggle();
  await f.controller.configure({ screenshotAction: 'edit' });
  await f.controller.start();
  const report = f.controller.report({ type: 'screenshot', name: f.controller.state().job.name, screenshotId });
  await Promise.resolve();
  assert.equal(f.controller.state().state, 'processing');

  await f.controller.cancel();
  opening.resolve();
  await report;

  assert.equal(f.controller.state().state, 'canceled');
  assert.equal(f.controller.state().result.projectId, screenshotId);
  assert.deepEqual(f.openScreenshots, [screenshotId]);
});

test('keeps a Studio quick export failure visible and ignores a stale export result', async () => {
  const failed = fixture({
    finalize: async () => {
      throw new Error('Video export unavailable');
    },
  });
  await failed.controller.toggle();
  await failed.controller.start();
  await failed.controller.report({ type: 'recording' });
  await failed.controller.report({ type: 'completed', session: { projectId: 'failed-studio-project' } });
  assert.equal(failed.controller.state().state, 'failed');
  assert.match(failed.controller.state().error, /Video export unavailable/);
  assert.deepEqual(failed.openEditors, []);

  const opening = deferred();
  const stale = fixture({ finalize: () => opening.promise });
  await stale.controller.toggle();
  await stale.controller.start();
  await stale.controller.report({ type: 'recording' });
  const report = stale.controller.report({ type: 'completed', session: { projectId: 'late-project' } });
  await Promise.resolve();
  assert.equal(stale.controller.state().state, 'processing');
  await stale.controller.cancel();
  opening.resolve();
  await report;

  assert.equal(stale.controller.state().state, 'canceled');
  assert.deepEqual(stale.openEditors, []);
});

for (const mode of ['studio', 'screenshot', 'instant']) {
  test(`${mode} portal cancellation returns to the existing Quick Snip and permits retry`, async () => {
    const f = fixture({ preferences: { extras: { captureMode: mode } } });
    await f.controller.toggle();
    await f.controller.start();
    const job = f.controller.state().job;
    const configurationCount = f.shownConfigurations.length;
    f.calls.length = 0;
    await f.controller.report({ type: 'capture-cancelled', name: job.name });
    assert.equal(f.controller.state().state, 'selecting');
    assert.equal(f.controller.state().job, job);
    assert.equal(f.controller.state().error, null);
    assert.deepEqual(f.calls, ['status.hide', 'state:selecting', 'crop.showExisting']);
    assert.equal(f.finalized.length, 0);
    assert.equal(f.shownConfigurations.length, configurationCount);
    await f.controller.start();
    assert.equal(f.controller.state().state, 'preparing');
    assert.equal(f.controller.state().job.name, job.name);
  });
}

test('ignores a stale cancellation or a cancellation received after recording starts', async () => {
  const f = fixture();
  await f.controller.toggle();
  await f.controller.start();
  const name = f.controller.state().job.name;
  await f.controller.report({ type: 'capture-cancelled', name: 'previous-job' });
  assert.equal(f.controller.state().state, 'preparing');
  await f.controller.report({ type: 'recording' });
  await f.controller.report({ type: 'capture-cancelled', name });
  assert.equal(f.controller.state().state, 'recording');
  await f.controller.cancel();
  await f.controller.report({ type: 'capture-cancelled', name });
  assert.equal(f.controller.state().state, 'canceled');
  assert.ok(!f.calls.includes('crop.showExisting'));
});

test('Screenshot shows processing and real previews before clipboard completion', async () => {
  const f = fixture({ preferences: { extras: { captureMode: 'screenshot' } } });
  await f.controller.toggle();
  await f.controller.start();
  const name = f.controller.state().job.name;
  assert.ok(f.calls.includes('status.prepare'));
  assert.ok(!f.calls.includes('status.processing'));
  await f.controller.report({ type: 'screenshot-captured', name, screenshotId });
  assert.equal(f.controller.state().state, 'processing');
  assert.equal(f.controller.state().copied, false);
  assert.equal(f.controller.state().preview, `project-media://screenshot/${screenshotId}/source.png`);
  assert.ok(f.calls.includes('status.processing'));
  await f.controller.report({ type: 'screenshot-rendered', name, preview: 'data:image/jpeg;base64,AA==' });
  assert.equal(f.controller.state().progress, 0.75);
  await f.controller.report({ type: 'screenshot', name, screenshotId });
  assert.equal(f.controller.state().state, 'completed');
  assert.equal(f.controller.state().copied, true);
  assert.equal(f.controller.state().preview, 'data:image/jpeg;base64,AA==');
});

test('Screenshot ignores stale stages and cancels a pending clipboard export', async () => {
  const f = fixture({ preferences: { extras: { captureMode: 'screenshot' } } });
  await f.controller.toggle();
  await f.controller.start();
  const name = f.controller.state().job.name;
  await f.controller.report({ type: 'screenshot-captured', name: 'stale', screenshotId });
  await f.controller.report({ type: 'screenshot-rendered', name, preview: 'untrusted' });
  assert.equal(f.controller.state().state, 'preparing');
  await f.controller.report({ type: 'screenshot-captured', name, screenshotId });
  await assert.rejects(
    f.controller.report({ type: 'screenshot-rendered', name, preview: 'https://arbitrary' }),
    /Invalid screenshot preview/,
  );
  await f.controller.report({ type: 'screenshot-rendered', name: 'stale', preview: 'data:image/jpeg;base64,AA==' });
  assert.equal(f.controller.state().progress, 0.25);
  await f.controller.cancel();
  assert.ok(f.calls.includes('crop.cancel'));
  await f.controller.report({ type: 'screenshot', name, screenshotId });
  assert.equal(f.controller.state().state, 'canceled');
  assert.equal(f.controller.state().copied, false);
});
