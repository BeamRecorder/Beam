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
    setAlwaysOnTop: (value) => calls.push(['top', value]),
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

test('hidden window ignores mouse events before it is ready', () => {
  const win = fakeWindow();
  new WindowController(win);
  assert.deepEqual(win.calls[0], ['mouse', true]);
});

test('ready HUD forwards pointer movement over transparent areas and stays on top', () => {
  const win = fakeWindow();
  const controller = new WindowController(win);
  controller.markReadyToShow();
  assert.ok(win.calls.some((call) => call[0] === 'mouse' && call[1] === true && call[2]?.forward === true));
  assert.equal(win.calls.at(-1)[0], 'top');
  assert.equal(win.calls.at(-1)[1], true);
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

test('minimized HUD stops intercepting clicks and loses topmost status', () => {
  const win = fakeWindow();
  const controller = new WindowController(win);
  controller.markReadyToShow();
  win.setMinimized(true);
  win.emit('minimize');
  assert.deepEqual(win.calls.at(-2), ['mouse', true]);
  assert.deepEqual(win.calls.at(-1), ['top', false]);
});

test('recorder mode passes through clicks outside the compact bar', async () => {
  let cursor = { x: 100, y: 100 };
  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    workArea: { x: 0, y: 0, width: 1000, height: 800 },
  };
  const screenModule = {
    getCursorScreenPoint: () => cursor,
    getDisplayNearestPoint: () => display,
  };
  const win = fakeWindow();
  const controller = new WindowController(win, { screenModule });
  controller.setMode('recorder');
  controller.markReadyToShow();

  assert.ok(win.calls.some((call) => call[0] === 'bounds' && call[1].width === RECORDER_SIZE.width));
  assert.ok(win.calls.some((call) => call[0] === 'mouse' && call[1] === true && call[2]?.forward === true));

  cursor = { x: 920, y: 240 };
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(win.calls.at(-1), ['mouse', false]);

  cursor = { x: 100, y: 100 };
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(win.calls.at(-1), ['mouse', true, { forward: true }]);
  controller.setMode('hud');
});

test('recorder tooltips choose the side with room after the bar moves', async () => {
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

  assert.equal(controller.setRecorderTooltip(true), 'left');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(win.getBounds().width, 300);

  controller.setRecorderTooltip(false);
  win.setPosition(0, 228);
  controller.rememberRecorderPosition();
  assert.equal(controller.setRecorderTooltip(true), 'right');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(win.getBounds(), { x: 0, y: 228, width: 300, height: 344 });
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
  controller.setRecorderTooltip(true);
  controller.rememberRecorderPosition();
  controller.flushRecorderPosition();

  assert.deepEqual(saved.at(-1).extras.recorderPositions['1'], { x: 908, y: 228 });
  controller.setMode('hud');
});
