const assert = require('node:assert/strict');
const test = require('node:test');
const { HUD_SIZE, RECORDER_SIZE, WindowController } = require('../apps/desktop/electron/window/window-controller.cjs');

function fakeWindow() {
  const listeners = new Map();
  const calls = [];
  let visible = false;
  let minimized = false;
  let maximized = false;
  let bounds = { x: 0, y: 0, width: HUD_SIZE.width, height: HUD_SIZE.height };
  return {
    calls,
    webContents: {
      send: (...args) => calls.push(['send', ...args]),
    },
    on: (event, listener) => listeners.set(event, listener),
    once: (event, listener) =>
      listeners.set(event, () => {
        listeners.delete(event);
        listener();
      }),
    emit: (event) => listeners.get(event)?.(),
    isDestroyed: () => false,
    isVisible: () => visible,
    isMinimized: () => minimized,
    isMaximized: () => maximized,
    getPosition: () => [bounds.x, bounds.y],
    getBounds: () => ({ ...bounds }),
    setPosition: (x, y) => {
      bounds = { ...bounds, x, y };
      calls.push(['position', x, y]);
    },
    setBounds: (next) => {
      bounds = { ...bounds, ...next };
      calls.push(['bounds', { ...bounds }]);
    },
    setVisible: (value) => {
      visible = value;
    },
    setMinimized: (value) => {
      minimized = value;
    },
    setAlwaysOnTop: (value, level) => calls.push(['top', value, level]),
    setIgnoreMouseEvents: (value, options) => calls.push(options ? ['mouse', value, options] : ['mouse', value]),
    setResizable: (value) => calls.push(['resizable', value]),
    setMaximizable: (value) => calls.push(['maximizable', value]),
    setMinimumSize: (width, height) => calls.push(['minimumSize', width, height]),
    setMaximumSize: (width, height) => calls.push(['maximumSize', width, height]),
    setContentProtection: (value) => calls.push(['contentProtection', value]),
    setSize: (width, height) => {
      bounds = { ...bounds, width, height };
      calls.push(['size', width, height]);
    },
    showInactive: () => {
      visible = true;
      listeners.get('show')?.();
    },
    show: () => {
      visible = true;
      calls.push(['show']);
      listeners.get('show')?.();
    },
    hide: () => {
      visible = false;
      calls.push(['hide']);
      listeners.get('hide')?.();
    },
    focus: () => calls.push(['focus']),
    moveTop: () => calls.push(['moveTop']),
    restore: () => {
      minimized = false;
      calls.push(['restore']);
      listeners.get('restore')?.();
    },
    maximize: () => {
      maximized = true;
      calls.push(['maximize']);
      listeners.get('maximize')?.();
    },
    unmaximize: () => {
      maximized = false;
      calls.push(['unmaximize']);
      listeners.get('unmaximize')?.();
    },
  };
}

function topCalls(win) {
  return win.calls.filter((call) => call[0] === 'top');
}

function expectedAlwaysOnTopLevel() {
  return process.platform === 'win32' ? 'screen-saver' : undefined;
}

test('Recorder centers independently on each display rather than reusing another display position', () => {
  const left = {
    id: 'left',
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
  };
  const right = {
    id: 'right',
    bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    workArea: { x: 0, y: 0, width: 2560, height: 1400 },
  };
  let selected = right;
  const win = fakeWindow();
  const controller = new WindowController(win, {
    screenModule: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => selected,
    },
    preferencesStore: {
      read: () => ({
        extras: {
          recorderPositions: { left: { x: -1000, y: 400 } },
          lastRecorderPosition: { x: -1000, y: 400 },
        },
      }),
      patch: () => {},
    },
  });
  controller.setMode('recorder');
  assert.deepEqual(win.getBounds(), { x: 1104, y: 1296, ...RECORDER_SIZE });
  controller.setMode('hud');
  selected = left;
  controller.setMode('recorder');
  assert.deepEqual(win.getBounds(), { x: -1000, y: 400, ...RECORDER_SIZE });
});

test('Recorder restores the X11 zero origin and clamps off-screen placements', () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  let stored = { x: 0, y: 0 };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    screenModule: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => display,
    },
    preferencesStore: {
      read: () => ({ extras: { recorderPositions: { 1: stored } } }),
      patch: () => {},
    },
  });
  controller.setMode('recorder');
  assert.deepEqual(win.getBounds(), { x: 0, y: 0, ...RECORDER_SIZE });
  stored = { x: 2000, y: -400 };
  controller.setMode('recorder');
  assert.deepEqual(win.getBounds(), { x: 648, y: 0, ...RECORDER_SIZE });
});

for (const platform of ['linux', 'darwin', 'win32']) {
  test(`${platform}: native input callbacks cannot reenter the same mouse policy`, () => {
    const win = fakeWindow();
    const controller = new WindowController(win, { platform, screenModule: {} });
    const original = win.setIgnoreMouseEvents;
    let depth = 0;
    win.setIgnoreMouseEvents = (...args) => {
      assert.ok(++depth < 3, 'Mouse policy reentered a native focus callback');
      original(...args);
      win.emit('focus');
      depth--;
    };
    controller.markReadyToShow();
    controller.setHudInteractive(true);
    const count = win.calls.filter((call) => call[0] === 'mouse').length;
    for (const event of ['focus', 'blur', 'restore', 'show']) win.emit(event);
    controller.setHudInteractive(true);
    assert.equal(win.calls.filter((call) => call[0] === 'mouse').length, count);
  });

  test(`${platform}: late renderer input cannot reactivate a hidden HUD`, () => {
    const win = fakeWindow();
    const controller = new WindowController(win, { platform, screenModule: {} });
    controller.markReadyToShow();
    controller.setHudInteractive(true);
    controller.setVisible(false);
    const count = win.calls.filter((call) => call[0] === 'mouse').length;
    controller.setHudInteractive(true);
    controller.setHudInteractive(false);
    assert.equal(win.calls.filter((call) => call[0] === 'mouse').length, count);
    assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', true]);
    controller.setVisible(true);
    controller.setHudInteractive(true);
    assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', false]);
  });

  test(`${platform}: native focus callbacks cannot reenter a topmost change`, () => {
    const win = fakeWindow();
    const setAlwaysOnTop = win.setAlwaysOnTop;
    let nativeChanges = 0;
    win.setAlwaysOnTop = (...args) => {
      assert.ok(++nativeChanges <= 2, 'topmost policy must not recurse through native focus events');
      setAlwaysOnTop(...args);
      win.emit('blur');
      win.emit('focus');
    };
    win.moveTop = () => {
      win.calls.push(['moveTop']);
      win.emit('focus');
    };
    const controller = new WindowController(win, { platform });
    controller.markReadyToShow();
    win.emit('blur');
    win.emit('focus');
    assert.equal(nativeChanges, 2);
    assert.equal(win.calls.filter((call) => call[0] === 'moveTop').length, 1);
    assert.equal(topCalls(win).at(-1)[2], platform === 'win32' ? 'screen-saver' : undefined);
  });

  test(`${platform}: demoting the HUD cannot raise it before native hide completes`, () => {
    const win = fakeWindow();
    const controller = new WindowController(win, { platform });
    controller.markReadyToShow();
    win.calls.length = 0;
    const setAlwaysOnTop = win.setAlwaysOnTop;
    win.setAlwaysOnTop = (...args) => {
      assert.ok(topCalls(win).length < 2, 'demotion must not recursively raise the HUD');
      setAlwaysOnTop(...args);
      win.emit('blur');
      win.emit('focus');
    };
    assert.equal(controller.setVisible(false), true);
    assert.deepEqual(
      topCalls(win).map((call) => call[1]),
      [false],
    );
    assert.ok(win.calls.filter((call) => call[0] === 'mouse').every((call) => call[1]));
    assert.equal(
      win.calls.some((call) => call[0] === 'moveTop'),
      false,
    );
  });

  test(`${platform}: showing a hidden HUD restores its native policy once`, () => {
    const win = fakeWindow();
    const controller = new WindowController(win, { platform });
    controller.markReadyToShow();
    controller.setVisible(false);
    win.calls.length = 0;
    win.show();
    win.emit('focus');
    assert.equal(controller.setVisible(true), true);
    assert.deepEqual(
      topCalls(win).map((call) => call[1]),
      [true],
    );
    assert.equal(win.calls.filter((call) => call[0] === 'moveTop').length, 1);
  });
}

function preferencesWithHudWindow(hudWindow, extras = {}) {
  let hudWindowReads = 0;
  const preferences = { extras };
  Object.defineProperty(preferences, 'hudWindow', {
    enumerable: true,
    get: () => {
      hudWindowReads += 1;
      return hudWindow;
    },
  });
  return {
    read: () => preferences,
    patch: () => undefined,
    hudWindowReads: () => hudWindowReads,
  };
}

function hudDisplay() {
  const display = {
    id: 1,
    bounds: { x: 100, y: 200, width: 400, height: 600 },
    workArea: { x: 100, y: 200, width: 400, height: 600 },
  };
  return {
    getCursorScreenPoint: () => ({ x: 300, y: 500 }),
    getDisplayNearestPoint: () => display,
  };
}

test('hidden window ignores mouse events before it is ready', () => {
  const win = fakeWindow();
  new WindowController(win);
  assert.deepEqual(win.calls[0], ['mouse', true]);
});

test('ready HUD forwards pointer movement over transparent areas and stays on top', () => {
  const win = fakeWindow();
  const controller = new WindowController(win, { platform: 'darwin' });
  controller.markReadyToShow();
  assert.ok(win.calls.some((call) => call[0] === 'mouse' && call[1] === true && call[2]?.forward === true));
  const top = topCalls(win).at(-1);
  assert.equal(top[1], true);
  assert.equal(top[2], expectedAlwaysOnTopLevel());
});

test('linux HUD and recorder stay interactive so the renderer can classify the pointer', () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const screenModule = {
    getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    getDisplayNearestPoint: () => display,
  };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    screenModule,
    platform: 'linux',
  });
  controller.markReadyToShow();
  controller.setHudInteractive(true);
  controller.setHudInteractive(false);
  assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', false]);
  controller.setMode('recorder');
  assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', false]);
  controller.setMode('hud');
  assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', false]);
});

test('recorder constraints are applied before its compact bounds', () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const screenModule = {
    getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    getDisplayNearestPoint: () => display,
  };
  const win = fakeWindow();
  const controller = new WindowController(win, { screenModule });

  const transitionStart = win.calls.length;
  controller.setMode('recorder');
  const transitionCalls = win.calls.slice(transitionStart);

  const recorderMinimum = transitionCalls.findIndex(
    (call) => call[0] === 'minimumSize' && call[1] === RECORDER_SIZE.width && call[2] === RECORDER_SIZE.height,
  );
  const recorderBounds = transitionCalls.findIndex(
    (call) => call[0] === 'bounds' && call[1].width === RECORDER_SIZE.width,
  );
  assert.ok(recorderMinimum >= 0);
  assert.ok(recorderMinimum < recorderBounds);
  controller.setMode('hud');
});

test('recorder reapplies always-on-top after the window is shown', () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    screenModule: {
      getCursorScreenPoint: () => ({ x: 500, y: 400 }),
      getDisplayNearestPoint: () => display,
    },
  });

  controller.setMode('recorder');
  assert.equal(topCalls(win).at(-1)[1], false);

  controller.markReadyToShow();

  const top = topCalls(win).at(-1);
  assert.equal(top[1], true);
  assert.equal(top[2], expectedAlwaysOnTopLevel());
  assert.ok(win.calls.some((call) => call[0] === 'moveTop'));

  win.emit('blur');
  assert.equal(topCalls(win).at(-1)[1], true);
  assert.equal(topCalls(win).at(-1)[2], expectedAlwaysOnTopLevel());
  win.emit('focus');
  assert.equal(topCalls(win).at(-1)[1], true);
  assert.equal(topCalls(win).at(-1)[2], expectedAlwaysOnTopLevel());
  controller.setMode('hud');
});

test('minimized HUD loses topmost status and regains it after restore', () => {
  const win = fakeWindow();
  const controller = new WindowController(win);
  controller.markReadyToShow();
  win.setMinimized(true);
  win.emit('minimize');
  assert.equal(win.calls.filter((call) => call[0] === 'mouse').at(-1)[1], true);
  assert.equal(topCalls(win).at(-1)[1], false);

  win.restore();
  const restoredTop = topCalls(win).at(-1);
  assert.equal(restoredTop[1], true);
  assert.equal(restoredTop[2], expectedAlwaysOnTopLevel());
});

test('recorder mode keeps its compact native hit target interactive', () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const screenModule = {
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    getDisplayNearestPoint: () => display,
  };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    screenModule,
    platform: 'darwin',
  });
  controller.setMode('recorder');
  controller.markReadyToShow();

  assert.ok(win.calls.some((call) => call[0] === 'bounds' && call[1].width === RECORDER_SIZE.width));
  assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', false]);
  controller.setMode('hud');
  assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', true, { forward: true }]);
});

test('recorder movement keeps the native bounds compact', () => {
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const screenModule = {
    getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    getDisplayNearestPoint: () => display,
  };
  const win = fakeWindow();
  const controller = new WindowController(win, { screenModule });
  controller.setMode('recorder');
  controller.markReadyToShow();

  const boundsCalls = () => win.calls.filter((call) => call[0] === 'bounds');
  const boundsCallsBeforeMove = boundsCalls().length;
  win.emit('move');

  assert.deepEqual(win.getBounds(), { x: 324, y: 696, width: 352, height: 88 });
  assert.equal(boundsCalls().length, boundsCallsBeforeMove);
  controller.setMode('hud');
});

test('recorder position persistence stores the compact bar position', () => {
  const saved = [];
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const screenModule = {
    getCursorScreenPoint: () => ({ x: 500, y: 400 }),
    getDisplayNearestPoint: () => display,
  };
  const preferencesStore = {
    read: () => ({ extras: {} }),
    patch: (value) => saved.push(value),
  };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    screenModule,
    preferencesStore,
  });
  controller.setMode('recorder');
  controller.rememberRecorderPosition();
  controller.flushRecorderPosition();
  assert.equal(saved.filter((entry) => entry.extras.recorderPositions).length, 0);
  win.setPosition(200, 300);
  win.emit('move');
  controller.flushRecorderPosition();
  assert.deepEqual(saved.at(-1).extras.recorderPositions['1'], {
    x: 200,
    y: 300,
  });
  win.setPosition(324, 696);
  win.emit('moved');
  assert.deepEqual(saved.at(-1).extras.recorderPositions['1'], {
    x: 324,
    y: 696,
  });
  controller.setMode('hud');
});

test('HUD restores and clamps saved positions using the normalized native width', () => {
  assert.deepEqual(HUD_SIZE, { width: 672, height: 268 });
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const preferencesStore = {
    read: () => ({ extras: { hudPosition: { x: 900, y: 700 } } }),
    patch: () => undefined,
  };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    preferencesStore,
    screenModule: { getDisplayNearestPoint: () => display },
  });

  assert.deepEqual(win.getPosition(), [328, 532]);
  controller.showHud();

  assert.deepEqual(win.calls.filter((call) => call[0] === 'minimumSize').at(-1), ['minimumSize', 672, 268]);
  assert.deepEqual(win.calls.filter((call) => call[0] === 'size').at(-1), ['size', 672, 268]);
  assert.deepEqual(win.getPosition(), [328, 532]);
});

test('saved Recorder setup preference controls the HUD while capture stays topmost', () => {
  const preferencesStore = {
    read: () => ({ alwaysOnTop: false }),
    patch: () => undefined,
  };
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const win = fakeWindow();
  const controller = new WindowController(win, {
    preferencesStore,
    screenModule: {
      getCursorScreenPoint: () => ({ x: 500, y: 400 }),
      getDisplayNearestPoint: () => display,
    },
  });
  controller.markReadyToShow();
  assert.equal(topCalls(win).at(-1)[1], false);
  controller.setMode('recorder');
  assert.equal(topCalls(win).at(-1)[1], true);
  controller.setMode('hud');
  assert.equal(topCalls(win).at(-1)[1], false);
});

test('live changes apply immediately without repeated native calls or disk reads on focus', () => {
  let reads = 0;
  const win = fakeWindow();
  const controller = new WindowController(win, {
    preferencesStore: {
      read: () => {
        reads++;
        return { alwaysOnTop: true };
      },
    },
  });
  controller.markReadyToShow();
  assert.equal(topCalls(win).at(-1)[1], true);
  controller.setHudAlwaysOnTop(false);
  assert.equal(topCalls(win).at(-1)[1], false);
  const calls = topCalls(win).length;
  const initialReads = reads;
  win.emit('blur');
  win.emit('focus');
  controller.setHudAlwaysOnTop(false);
  assert.equal(topCalls(win).length, calls);
  assert.equal(reads, initialReads);
  controller.setHudAlwaysOnTop(true);
  assert.equal(topCalls(win).at(-1)[1], true);
});

test('preference changes never raise hidden or minimized setup windows', () => {
  const win = fakeWindow();
  const controller = new WindowController(win);
  controller.markReadyToShow();
  controller.setVisible(false);
  controller.setHudAlwaysOnTop(false);
  controller.setHudAlwaysOnTop(true);
  assert.equal(topCalls(win).at(-1)[1], false);
  controller.setVisible(true);
  assert.equal(topCalls(win).at(-1)[1], true);
  win.setMinimized(true);
  win.emit('minimize');
  controller.setHudAlwaysOnTop(false);
  controller.setHudAlwaysOnTop(true);
  assert.equal(topCalls(win).at(-1)[1], false);
});

test('editor transition demotes and hides the HUD until it is explicitly shown again', () => {
  const win = fakeWindow();
  const controller = new WindowController(win);

  controller.markReadyToShow();
  assert.equal(topCalls(win).at(-1)[1], true);

  controller.setVisible(false);
  assert.equal(topCalls(win).at(-1)[1], false);
  assert.deepEqual(win.calls.filter((call) => call[0] === 'mouse').at(-1), ['mouse', true]);

  controller.setVisible(true);
  assert.equal(topCalls(win).at(-1)[1], true);
});

test('WindowController reads hudWindow and normalizes every unexpected size to the default', () => {
  for (const hudWindow of [
    undefined,
    null,
    {},
    { width: 711, height: 268 },
    { width: 672, height: 283 },
    { width: 672.5, height: 268 },
    { width: '672', height: 268 },
    [672, 268],
  ]) {
    const preferencesStore = preferencesWithHudWindow(hudWindow);
    const controller = new WindowController(fakeWindow(), { preferencesStore });

    assert.ok(preferencesStore.hudWindowReads() > 0);
    assert.deepEqual(controller.hudSize, HUD_SIZE);
  }
});

test('showHud applies the normalized HUD size to native bounds, minimum, and saved-position clamping', () => {
  const win = fakeWindow();
  const controller = new WindowController(win, {
    preferencesStore: preferencesWithHudWindow({ width: 999, height: 999 }, { hudPosition: { x: 999, y: 999 } }),
    screenModule: hudDisplay(),
  });

  controller.showHud();

  assert.deepEqual(win.getBounds(), {
    x: 100,
    y: 532,
    width: 672,
    height: 268,
  });
  assert.deepEqual(win.calls.filter((call) => call[0] === 'minimumSize').at(-1), [
    'minimumSize',
    HUD_SIZE.width,
    HUD_SIZE.height,
  ]);
  assert.deepEqual(win.calls.filter((call) => call[0] === 'position').at(-1), ['position', 100, 532]);
});

test('Recorder keeps its fixed horizontal native bounds with an unexpected HUD size', () => {
  const win = fakeWindow();
  const controller = new WindowController(win, {
    preferencesStore: preferencesWithHudWindow({ width: 1, height: 1 }),
    screenModule: hudDisplay(),
  });

  controller.setMode('recorder');

  assert.deepEqual(win.getBounds(), { x: 124, y: 696, width: 352, height: 88 });
  assert.deepEqual(win.calls.filter((call) => call[0] === 'minimumSize').at(-1), [
    'minimumSize',
    RECORDER_SIZE.width,
    RECORDER_SIZE.height,
  ]);
});

test('a suspended HUD reloads before it becomes visible', async () => {
  const window = fakeWindow();
  const controller = new WindowController(window, { platform: 'linux' });
  let suspended = true,
    release;
  controller.rendererLifecycle = {
    isSuspended: () => suspended,
    resume: () =>
      new Promise((resolve) => {
        release = () => {
          suspended = false;
          resolve();
        };
      }),
  };
  assert.equal(controller.setVisible(true), false);
  assert.equal(window.isVisible(), false);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.isVisible(), true);
});
test('hiding a suspended HUD does not wake its renderer', () => {
  const window = fakeWindow();
  const controller = new WindowController(window, { platform: 'linux' });
  let wakes = 0;
  controller.rendererLifecycle = {
    isSuspended: () => true,
    resume: async () => {
      wakes++;
    },
  };
  controller.setVisible(false);
  assert.equal(wakes, 0);
  assert.equal(window.isVisible(), false);
});
test('failed HUD wake remains hidden and reports the failure', async (t) => {
  const window = fakeWindow();
  const controller = new WindowController(window, { platform: 'linux' });
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  controller.rendererLifecycle = {
    isSuspended: () => true,
    resume: async () => {
      throw Error('renderer unavailable');
    },
  };
  controller.setVisible(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(window.isVisible(), false);
  assert.equal(errors[0][0], '[HUD wake]');
});
