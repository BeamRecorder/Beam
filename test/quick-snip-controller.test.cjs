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

function harness({ normalRecording = false, pendingSelection = false, finalize } = {}) {
  const calls = [];
  const selectionOverlayWindow = { id: 'selection-overlay' };
  let resolveSelection;
  const selection = pendingSelection
    ? new Promise((resolve) => {
        resolveSelection = resolve;
      })
    : Promise.resolve({ bounds, region });
  const cropWindow = {
    hide: () => calls.push('crop.hide'),
    show: () => calls.push('crop.show'),
    setParentWindow: (parent) => calls.push(`crop.parent:${parent ? parent.id : 'none'}`),
    command: (command) => calls.push(`crop.${command}`),
    setRecording: (active) => calls.push(`crop.recording:${active}`),
  };
  const statusWindow = {
    hide: () => calls.push('status.hide'),
    update: (value) => calls.push(`status.${value.state}`),
    show: () => calls.push('status.show'),
  };
  const regionOverlay = {
    select: () => selection,
    nativeWindow: () => selectionOverlayWindow,
    cancel: () => calls.push('selection.cancel'),
    confirmCurrent: () => {
      calls.push('selection.confirm');
      resolveSelection?.({ bounds, region });
    },
  };
  const controller = createQuickSnipController({
    userPaths: { quickSnipWork: '/work', quickSnipRaw: '/raw', quickSnipStudio: '/studio', projects: '/projects' },
    preferencesStore: { read: () => ({ extras: {} }), patch: () => calls.push('preferences.patch') },
    presetStore: { read: () => ({ activePresetId: 'default', presets: [preset] }) },
    projectStore: {},
    regionOverlay,
    cropWindow,
    statusWindow,
    resolveDisplay: () => ({ id: 1, bounds, workArea: bounds }),
    isNormalRecordingActive: () => normalRecording,
    finalize:
      finalize ??
      (async ({ onProgress }) => {
        onProgress(0.5);
        return { path: '/studio/snippet.mp4', projectId: 'project' };
      }),
    copyFile: () => calls.push('copy'),
  });
  return { controller, calls, selectionOverlayWindow };
}

test('one toggle selects, starts, stops and finalizes Quick Snip according to state', async () => {
  const { controller, calls } = harness();
  assert.equal(controller.state().state, 'idle');
  await controller.toggle();
  assert.equal(controller.state().state, 'selecting');
  await controller.toggle();
  assert.equal(controller.state().state, 'preparing');
  assert.ok(calls.includes('crop.start'));
  await controller.report({ type: 'recording' });
  assert.equal(controller.state().state, 'recording');
  await controller.toggle();
  assert.equal(controller.state().state, 'finalizing');
  await controller.report({ type: 'completed', session: { projectId: 'project' } });
  assert.equal(controller.state().state, 'completed');
  assert.equal(controller.state().result.path, '/studio/snippet.mp4');
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

test('owns the Crop Bar by the selection overlay and detaches it before confirming the region', async () => {
  const { controller, calls } = harness({ pendingSelection: true });

  void controller.toggle();
  await Promise.resolve();
  const attachIndex = calls.indexOf('crop.parent:selection-overlay');
  assert.ok(attachIndex >= 0);

  await controller.toggle();
  const detachIndex = calls.indexOf('crop.parent:none');
  const confirmationIndex = calls.indexOf('selection.confirm');
  assert.ok(detachIndex >= 0);
  assert.ok(confirmationIndex > detachIndex);
});

test('preparing toggle cancels while processing toggle only restores status', async () => {
  const { controller, calls } = harness();
  await controller.toggle();
  await controller.toggle();
  await controller.toggle();
  assert.equal(controller.state().state, 'canceled');
  assert.ok(calls.includes('crop.cancel'));
  assert.equal(calls.filter((call) => call === 'status.hide').length, 2);
  assert.equal(controller.state().progress, 0);

  await controller.toggle();
  await controller.toggle();
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

  await controller.toggle();
  await controller.toggle();
  await controller.report({ type: 'recording' });
  await controller.stop();
  const completion = controller.report({ type: 'completed', session: { projectId: 'project' } });
  await Promise.resolve();
  assert.equal(controller.state().state, 'processing');

  await controller.cancel();
  assert.equal(controller.state().state, 'canceled');
  resolveFinalize({ path: '/studio/late-result.mp4', projectId: 'project' });
  await completion;

  assert.equal(controller.state().state, 'canceled');
  assert.equal(controller.state().result, null);
  assert.equal(calls.includes('copy'), false);
});

test('late failed and completed reports after cancel do not reopen the status window', async () => {
  let resolveFinalize;
  const finalize = () =>
    new Promise((resolve) => {
      resolveFinalize = resolve;
    });
  const { controller, calls } = harness({ finalize });

  await controller.toggle();
  await controller.toggle();
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

  resolveFinalize({ path: '/studio/late-result.mp4', projectId: 'project' });
  await completion;
});
