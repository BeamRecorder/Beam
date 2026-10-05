const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  const calls = [];
  let idleOptions, trayOptions, cleanup;
  let suspended = false,
    checkpoint = true,
    state = 'idle',
    normal = false,
    screenshot = false,
    onboarding = true,
    selectingRegion = false;
  const window = new EventEmitter();
  window.webContents = { send: (...args) => calls.push(args) };
  const controller = { setVisible: (value) => calls.push(['visible', value]) };
  const idle = {
    schedule: () => calls.push(['schedule']),
    resume: async () => {
      calls.push(['resume']);
      suspended = false;
    },
    isSuspended: () => suspended,
    destroy: () => calls.push(['idle.destroy']),
  };
  const originalLoad = Module._load;
  const modulePath = require.resolve('../apps/desktop/electron/lifecycle/tray-runtime.cjs');
  delete require.cache[modulePath];
  Module._load = function (name, ...args) {
    if (name === '../tray/tray-manager.cjs')
      return {
        createTrayManager: (options) => {
          trayOptions = options;
          return {
            updateMenu: () => calls.push(['menu']),
            setQuickSnipState: (value) => calls.push(['state', value]),
            destroy: () => calls.push(['tray.destroy']),
          };
        },
      };
    if (name === './idle-hud-renderer.cjs')
      return {
        createIdleHudRenderer: (options) => {
          idleOptions = options;
          return idle;
        },
      };
    return originalLoad.call(this, name, ...args);
  };
  let manager;
  try {
    manager = require(modulePath).createTrayRuntime({
      window,
      controller,
      showHud: () => calls.push(['show']),
      quickSnipService: {
        isNormalRecordingActive: () => normal,
        controller: {
          state: () => ({ state }),
          cancel: async () => calls.push(['cancel']),
          toggle: async () => calls.push(['toggle']),
        },
      },
      cameraOverlay: { destroy: () => calls.push(['camera.destroy']) },
      countdownOverlay: { suspend: () => calls.push(['countdown.suspend']) },
      teleprompterWindow: { suspend: async () => checkpoint },
      preferencesStore: { read: () => ({ onboardingCompleted: onboarding }) },
      applicationRoot: '/beam',
      coordinator: {
        registerCleanup: (entry) => {
          cleanup = entry.cleanup;
        },
      },
      isScreenshotBusy: () => screenshot,
      regionOverlay: { isSelecting: () => selectingRegion },
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
  return {
    manager,
    window,
    calls,
    idleOptions,
    trayOptions,
    cleanup: () => cleanup(),
    set: (values) => {
      if ('suspended' in values) suspended = values.suspended;
      if ('checkpoint' in values) checkpoint = values.checkpoint;
      if ('state' in values) state = values.state;
      if ('normal' in values) normal = values.normal;
      if ('screenshot' in values) screenshot = values.screenshot;
      if ('onboarding' in values) onboarding = values.onboarding;
      if ('selectingRegion' in values) selectingRegion = values.selectingRegion;
    },
  };
}
test('standby requires completed onboarding and no capture, screenshot, selection or finalization', () => {
  const f = fixture();
  assert.equal(f.idleOptions.canSuspend(), true);
  for (const state of ['selecting', 'preparing', 'recording', 'finalizing', 'processing']) {
    f.set({ state });
    assert.equal(f.idleOptions.canSuspend(), false);
  }
  f.set({ state: 'idle' });
  for (const key of ['normal', 'screenshot', 'selectingRegion']) {
    f.set({ [key]: true });
    assert.equal(f.idleOptions.canSuspend(), false);
    f.set({ [key]: false });
  }
  f.set({ onboarding: false });
  assert.equal(f.idleOptions.canSuspend(), false);
});
test('releases camera and countdown only after a successful teleprompter checkpoint', async () => {
  const f = fixture();
  f.set({ checkpoint: false });
  assert.equal(await f.idleOptions.releaseAuxiliary(), false);
  assert.deepEqual(f.calls, []);
  f.set({ checkpoint: true });
  assert.equal(await f.idleOptions.releaseAuxiliary(), true);
  assert.deepEqual(f.calls, [['countdown.suspend'], ['camera.destroy']]);
});
test('Show wakes Beam while Hide changes only its visibility', async () => {
  const f = fixture();
  f.trayOptions.onShowHud();
  await flush();
  assert.deepEqual(f.calls, [['resume'], ['show']]);
  f.trayOptions.onHideHud();
  assert.deepEqual(f.calls.at(-1), ['visible', false]);
});
test('tray Quick Snip hides selection and separately opens or stops capture', async () => {
  const f = fixture();
  for (const state of ['selecting', 'idle', 'recording']) {
    f.set({ state });
    f.trayOptions.onQuickSnip();
    await flush();
  }
  assert.deepEqual(f.calls, [['cancel'], ['toggle'], ['toggle']]);
});
test('only a sleeping HUD consumes wake shortcuts and forwards them after resume', async () => {
  const f = fixture();
  assert.equal(f.manager.dispatchHudShortcut('hud.start'), false);
  f.set({ suspended: true });
  assert.equal(f.manager.dispatchHudShortcut('hud.start'), true);
  await flush();
  assert.deepEqual(f.calls, [['resume'], ['show'], ['preferences:shortcut', 'hud.start']]);
});
test('visibility and Quick Snip changes refresh standby, and disposal detaches native listeners', () => {
  const f = fixture();
  f.window.emit('hide');
  assert.deepEqual(f.calls, [['menu'], ['schedule']]);
  f.manager.setQuickSnipState('completed');
  assert.deepEqual(f.calls.slice(-2), [['state', 'completed'], ['schedule']]);
  f.manager.destroy();
  assert.equal(f.window.listenerCount('hide'), 0);
  assert.equal(f.window.listenerCount('show'), 0);
  assert.deepEqual(f.calls.slice(-2), [['idle.destroy'], ['tray.destroy']]);
  f.cleanup();
});
