const assert = require('node:assert/strict');
const test = require('node:test');
const { HUD_SIZE, RECORDER_SIZE, WindowController } = require('../electron/window/window-controller.cjs');

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
  const controller = new WindowController(win, { screenModule, platform: 'linux' });
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
  const controller = new WindowController(win, { screenModule, platform: 'darwin' });
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

  assert.deepEqual(win.getBounds(), { x: 908, y: 228, width: 72, height: 344 });
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
  const controller = new WindowController(win, { screenModule, preferencesStore });
  controller.setMode('recorder');
  controller.rememberRecorderPosition();
  controller.flushRecorderPosition();

  assert.deepEqual(saved.at(-1).extras.recorderPositions['1'], { x: 908, y: 228 });
  controller.setMode('hud');
});

test('window controller respects alwaysOnTop preference', () => {
  let currentAlwaysOnTop = true;
  const preferencesStore = {
    read: () => ({ alwaysOnTop: currentAlwaysOnTop }),
  };
  const win = fakeWindow();
  const controller = new WindowController(win, { preferencesStore });

  // HUD mode when ready, with alwaysOnTop: true
  controller.markReadyToShow();
  const alwaysOnTopCallsTrue = win.calls.filter((call) => call[0] === 'top');
  assert.equal(alwaysOnTopCallsTrue.at(-1)[1], true);

  // Toggle alwaysOnTop to false, apply policy again
  currentAlwaysOnTop = false;
  controller.applyModePolicy();
  const alwaysOnTopCallsFalse = win.calls.filter((call) => call[0] === 'top');
  assert.equal(alwaysOnTopCallsFalse.at(-1)[1], false);

  // A focus transition must not re-enable a disabled preference.
  win.emit('blur');
  assert.equal(topCalls(win).at(-1)[1], false);
  currentAlwaysOnTop = true;
  win.emit('focus');
  assert.equal(topCalls(win).at(-1)[1], true);
  assert.equal(topCalls(win).at(-1)[2], expectedAlwaysOnTopLevel());
});
