const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

function loadCountdownWindow({
  platform,
  environment,
  isPackaged = false,
  loadResultForWindow = () => undefined,
  workArea = { x: 0, y: 0, width: 1_000, height: 800 },
}) {
  const calls = [];
  const screenCalls = [];
  const windows = [];

  const createWindow = () => {
    const contentListeners = new Map();
    const addContentListener = (event, listener, once) => {
      const listeners = contentListeners.get(event) ?? [];
      listeners.push({ listener, once });
      contentListeners.set(event, listeners);
    };
    const windowCalls = [];
    let destroyed = false;
    const record = (call) => {
      calls.push(call);
      windowCalls.push(call);
    };
    const window = {
      webContents: {
        on: (event, listener) => addContentListener(event, listener, false),
        once: (event, listener) => addContentListener(event, listener, true),
        send: (...args) => record(['send', ...args]),
      },
      calls: windowCalls,
      emitContent: (event, ...args) => {
        const listeners = contentListeners.get(event) ?? [];
        contentListeners.set(
          event,
          listeners.filter(({ once }) => !once),
        );
        for (const { listener } of listeners) listener(...args);
      },
      isDestroyed: () => destroyed,
      setIgnoreMouseEvents: (value) => record(['mouse', value]),
      setPosition: (...args) => record(['position', ...args]),
      show: () => record(['show']),
      showInactive: () => record(['showInactive']),
      moveTop: () => record(['top']),
      hide: () => record(['hide']),
      destroy: () => {
        destroyed = true;
        record(['destroy']);
      },
      loadURL: (url) => {
        record(['loadURL', url]);
        return loadResultForWindow(windows.indexOf(window));
      },
      loadFile: (...args) => {
        record(['loadFile', ...args]);
        return loadResultForWindow(windows.indexOf(window));
      },
    };
    windows.push(window);
    return window;
  };

  const electron = {
    BrowserWindow: class {
      constructor(options) {
        calls.push(['constructor', options]);
        return createWindow();
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
      isPackaged,
      platform,
      environment,
    });
    return {
      calls,
      screenCalls,
      windows,
      window: windows[0],
      overlay,
      finishLoad: (index = 0) => windows[index].emitContent('did-finish-load'),
      failLoad: (index = 0, { code = -2, isMainFrame = true } = {}) =>
        windows[index].emitContent(
          'did-fail-load',
          {},
          code,
          'load failed',
          'http://localhost:6500/countdown.html',
          isMainFrame,
        ),
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('prewarms the dedicated countdown renderer in development and packaged builds', async () => {
  for (const isPackaged of [false, true]) {
    const fixture = loadCountdownWindow({ platform: 'linux', environment: {}, isPackaged });
    const expected = isPackaged
      ? ['loadFile', path.join('/app', 'dist/countdown.html')]
      : ['loadURL', 'http://localhost:6500/countdown.html'];
    assert.deepEqual(
      fixture.calls.find(([name]) => name.startsWith('load')),
      expected,
    );
    const ready = fixture.overlay.prepare();
    fixture.overlay.show(3);
    fixture.overlay.show(2);
    fixture.finishLoad();
    await ready;
    assert.deepEqual(
      fixture.calls.filter(([name]) => name === 'send'),
      [['send', 'countdown:state', 2]],
    );
    fixture.overlay.destroy();
  }
});

test('suspend clears a queued countdown and ignores readiness from the destroyed renderer after recreation', async () => {
  const fixture = loadCountdownWindow({ platform: 'linux', environment: { XDG_SESSION_TYPE: 'x11' } });
  const firstReady = fixture.overlay.prepare();
  firstReady.catch(() => undefined);
  fixture.overlay.show(3);

  await fixture.overlay.suspend();
  assert.equal(fixture.windows[0].isDestroyed(), true);
  assert.ok(fixture.windows[0].calls.some(([name]) => name === 'destroy'));

  const secondReady = fixture.overlay.prepare();
  assert.equal(fixture.windows.length, 2);
  fixture.finishLoad(0);
  await Promise.resolve();
  assert.equal(
    fixture.windows[1].calls.some(([name]) => ['show', 'showInactive', 'top'].includes(name)),
    false,
    'a stale load callback must not reveal or raise the replacement window',
  );
  assert.equal(
    fixture.windows[1].calls.some(([name, channel]) => name === 'send' && channel === 'countdown:state'),
    false,
    'the queued countdown must not cross the suspend boundary',
  );

  fixture.finishLoad(1);
  await secondReady;
  assert.equal(
    fixture.windows[1].calls.some(([name]) => ['show', 'showInactive', 'top'].includes(name)),
    false,
    'prepare recreates a hidden window without presenting it',
  );
  fixture.overlay.show(2);
  assert.ok(
    fixture.windows[1].calls.some(
      ([name, channel, seconds]) => name === 'send' && channel === 'countdown:state' && seconds === 2,
    ),
  );
  await fixture.overlay.suspend();
});

test('ignores aborted and subframe loads, then fails the main load and recreates for a retry', async () => {
  const fixture = loadCountdownWindow({ platform: 'linux', environment: { XDG_SESSION_TYPE: 'x11' } });
  const firstReady = fixture.overlay.prepare();
  fixture.overlay.show(3);

  fixture.failLoad(0, { code: -3, isMainFrame: true });
  fixture.failLoad(0, { code: -2, isMainFrame: false });
  await Promise.resolve();
  assert.equal(fixture.windows[0].isDestroyed(), false);

  fixture.failLoad(0, { code: -2, isMainFrame: true });
  assert.equal(await firstReady, false);
  assert.equal(fixture.windows[0].isDestroyed(), true);

  const retryReady = fixture.overlay.prepare();
  assert.equal(fixture.windows.length, 2);
  fixture.finishLoad(0);
  await Promise.resolve();
  assert.equal(fixture.windows[1].isDestroyed(), false, 'stale load events must not destroy the retry');
  fixture.finishLoad(1);
  assert.equal(await retryReady, true);
  assert.equal(
    fixture.windows[1].calls.some(([name]) => name === 'send'),
    false,
    'failed queued seconds are cleared',
  );

  fixture.overlay.show(2);
  assert.ok(
    fixture.windows[1].calls.some(
      ([name, channel, value]) => name === 'send' && channel === 'countdown:state' && value === 2,
    ),
  );
  await fixture.overlay.suspend();
});

test('recreates the countdown after its navigation promise rejects', async () => {
  const fixture = loadCountdownWindow({
    platform: 'linux',
    environment: {},
    loadResultForWindow: (index) => (index === 0 ? Promise.reject(new Error('navigation failed')) : undefined),
  });
  const failedReady = fixture.overlay.prepare();
  assert.equal(await failedReady, false);
  assert.equal(fixture.windows[0].isDestroyed(), true);

  const retryReady = fixture.overlay.prepare();
  fixture.finishLoad(1);
  assert.equal(await retryReady, true);
  assert.equal(fixture.windows[1].isDestroyed(), false);
  await fixture.overlay.suspend();
});

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
