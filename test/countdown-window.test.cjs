const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

function loadCountdownWindow({ platform, environment, workArea = { x: 0, y: 0, width: 1_000, height: 800 } }) {
  const calls = [];
  const screenCalls = [];
  let finishLoad;
  let failLoad;
  let destroyed = false;

  const window = {
    webContents: {
      once: (event, listener) => {
        if (event === 'did-finish-load') finishLoad = listener;
        if (event === 'did-fail-load') failLoad = listener;
      },
      send: (...args) => calls.push(['send', ...args]),
    },
    isDestroyed: () => destroyed,
    setIgnoreMouseEvents: (value) => calls.push(['mouse', value]),
    setPosition: (...args) => calls.push(['position', ...args]),
    show: () => calls.push(['show']),
    showInactive: () => calls.push(['showInactive']),
    moveTop: () => calls.push(['top']),
    hide: () => calls.push(['hide']),
    destroy: () => {
      destroyed = true;
      calls.push(['destroy']);
    },
    loadURL: (url) => calls.push(['loadURL', url]),
    loadFile: (...args) => calls.push(['loadFile', ...args]),
  };

  const electron = {
    BrowserWindow: class {
      constructor(options) {
        calls.push(['constructor', options]);
        return window;
      }
    },
    screen: {
      getCursorScreenPoint: () => {
        screenCalls.push('getCursorScreenPoint');
        return { x: 500, y: 400 };
      },
      getDisplayNearestPoint: () => {
        screenCalls.push('getDisplayNearestPoint');
        return { workArea };
      },
    },
  };

  const originalLoad = Module._load;
  const modulePath = path.resolve(__dirname, '../electron/countdown-window.cjs');
  delete require.cache[modulePath];
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createCountdownWindow } = require(modulePath);
    const overlay = createCountdownWindow({
      applicationRoot: '/app',
      isPackaged: false,
      platform,
      environment,
    });
    return { calls, screenCalls, window, overlay, finishLoad: () => finishLoad(), failLoad: () => failLoad() };
  } finally {
    Module._load = originalLoad;
  }
}

test('Wayland presents the countdown without unsupported global window operations', () => {
  const fixture = loadCountdownWindow({
    platform: 'linux',
    environment: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' },
  });
  const constructor = fixture.calls.find((call) => call[0] === 'constructor');

  assert.equal(constructor[1].width, 560);
  assert.equal(constructor[1].height, 256);
  assert.equal(constructor[1].show, false);
  assert.equal(constructor[1].center, true);
  assert.equal(constructor[1].focusable, false);
  assert.ok(fixture.calls.some((call) => call[0] === 'mouse' && call[1] === true));
  assert.deepEqual(fixture.screenCalls, []);

  fixture.overlay.show(3);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'send'),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call[0] === 'show'),
    false,
  );

  fixture.finishLoad();
  assert.ok(fixture.calls.some((call) => call[0] === 'send' && call[1] === 'countdown:state' && call[2] === 3));
  assert.equal(fixture.calls.filter((call) => call[0] === 'show').length, 1);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'showInactive'),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call[0] === 'top'),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call[0] === 'position'),
    false,
  );
  assert.deepEqual(fixture.screenCalls, []);

  fixture.overlay.show(2);
  assert.equal(fixture.calls.filter((call) => call[0] === 'show').length, 2);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'showInactive'),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call[0] === 'top'),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call[0] === 'position'),
    false,
  );

  fixture.overlay.show(null);
  assert.equal(fixture.calls.at(-1)[0], 'hide');
});

test('X11 positions and raises the countdown with the supported inactive path', () => {
  const fixture = loadCountdownWindow({
    platform: 'linux',
    environment: { XDG_SESSION_TYPE: 'x11' },
  });
  const constructor = fixture.calls.find((call) => call[0] === 'constructor');

  assert.equal(constructor[1].width, 560);
  assert.equal(constructor[1].height, 256);
  assert.equal(constructor[1].show, false);
  assert.equal(constructor[1].center, false);
  assert.equal(constructor[1].focusable, false);
  assert.ok(fixture.calls.some((call) => call[0] === 'mouse' && call[1] === true));

  fixture.overlay.show(3);
  assert.equal(
    fixture.calls.some((call) => call[0] === 'send'),
    false,
  );
  assert.equal(
    fixture.calls.some((call) => call[0] === 'showInactive'),
    false,
  );

  fixture.finishLoad();
  assert.ok(fixture.calls.some((call) => call[0] === 'send' && call[1] === 'countdown:state' && call[2] === 3));
  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'position'),
    [
      ['position', 220, 272],
      ['position', 220, 272],
    ],
  );
  assert.equal(fixture.calls.filter((call) => call[0] === 'showInactive').length, 1);
  assert.equal(fixture.calls.filter((call) => call[0] === 'top').length, 1);
  assert.deepEqual(fixture.screenCalls, [
    'getCursorScreenPoint',
    'getDisplayNearestPoint',
    'getCursorScreenPoint',
    'getDisplayNearestPoint',
  ]);

  fixture.overlay.show(2);
  assert.equal(fixture.calls.filter((call) => call[0] === 'showInactive').length, 2);
  assert.equal(fixture.calls.filter((call) => call[0] === 'top').length, 2);
  assert.ok(fixture.calls.some((call) => call[0] === 'send' && call[1] === 'countdown:state' && call[2] === 2));

  fixture.overlay.show(null);
  assert.equal(fixture.calls.at(-1)[0], 'hide');
});

test('clamps countdown positioning to the work-area origin when the work area is smaller than the window', () => {
  const fixture = loadCountdownWindow({
    platform: 'linux',
    environment: { XDG_SESSION_TYPE: 'x11' },
    workArea: { x: 37, y: 19, width: 400, height: 180 },
  });

  fixture.overlay.show(3);
  fixture.finishLoad();

  assert.deepEqual(
    fixture.calls.filter((call) => call[0] === 'position'),
    [
      ['position', 37, 19],
      ['position', 37, 19],
    ],
  );
});
