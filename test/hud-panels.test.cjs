const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

function fixture({ packaged = false, captureWarmup = Promise.resolve(), visible = false } = {}) {
  const handlers = new Map();
  const windows = [];
  const hud = new EventEmitter();
  hud.webContents = { send: (...args) => sent.push(args) };
  hud.isDestroyed = () => false;
  hud.visible = visible;
  hud.topmost = true;
  hud.isVisible = () => hud.visible;
  hud.isAlwaysOnTop = () => hud.topmost;
  const sent = [];
  const controller = { mode: 'hud' };
  let active = true;
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.destroyed = false;
      this.shown = 0;
      this.visible = false;
      this.topmost = false;
      this.topmostCalls = [];
      this.topMoves = 0;
      this.visibility = [];
      this.throttling = [];
      this.minimized = false;
      this.webContents = new EventEmitter();
      this.webContents.send = (...args) => this.visibility.push(args);
      this.webContents.setBackgroundThrottling = (value) => this.throttling.push(value);
      this.webContents.setZoomFactor = () => {};
      this.webContents.setZoomLevel = () => {};
      this.devtools = [];
      this.webContents.openDevTools = (options) => this.devtools.push(options);
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return this.minimized;
    }
    isVisible() {
      return this.visible;
    }
    restore() {
      this.minimized = false;
      this.emit('restore');
    }
    setAlwaysOnTop(value, level) {
      this.topmost = value;
      this.topmostCalls.push([value, level]);
    }
    moveTop() {
      this.topMoves++;
    }
    hide() {
      this.visible = false;
      this.emit('hide');
    }
    show() {
      this.shown++;
      this.visible = true;
    }
    focus() {}
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
    loadFile(file, options) {
      this.file = file;
      this.query = options.query;
      return Promise.resolve();
    }
    close() {
      let prevented = false;
      this.emit('close', { preventDefault: () => (prevented = true) });
      if (!prevented) this.destroy();
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const previous = Module._load;
  Module._load = function (request, parent, main) {
    return request === 'electron' ? { BrowserWindow: Window } : previous.call(this, request, parent, main);
  };
  try {
    const modulePath = require.resolve('../apps/desktop/electron/window/hud-panels.cjs');
    delete require.cache[modulePath];
    const { createHudPanelManager } = require(modulePath);
    const manager = createHudPanelManager({
      applicationRoot: '/beam',
      isPackaged: packaged,
      captureWarmup,
      hudWindow: hud,
      hudController: controller,
      canAcceptWork: () => active,
      ipcMain: {
        handle: (name, fn) => handlers.set(name, fn),
        on: (name, fn) => handlers.set(name, fn),
      },
    });
    return {
      windows,
      hud,
      sent,
      controller,
      manager,
      handlers,
      stop: () => {
        active = false;
      },
      open: (role) => handlers.get(`hud:open-${role}`)({ sender: hud.webContents }),
      ready: (window) => {
        handlers.get('hud-panel:prepared')({ sender: window.webContents });
        window.emit('ready-to-show');
        handlers.get('hud-panel:ready')({ sender: window.webContents });
        window.emit('ready-to-show');
      },
    };
  } finally {
    Module._load = previous;
  }
}

for (const role of ['settings', 'projects']) {
  test(`${role} is an independent opaque window shown only after both readiness signals`, async () => {
    const f = fixture();
    const opening = f.open(role);
    const win = f.windows[0];
    assert.equal(win.options.transparent, false);
    assert.equal(win.options.parent, undefined);
    assert.equal(win.options.webPreferences.contextIsolation, true);
    assert.equal(win.options.webPreferences.nodeIntegration, false);
    assert.equal(win.options.webPreferences.zoomFactor, 1);
    if (role === 'projects') {
      assert.equal(win.options.frame, false);
      assert.equal(win.options.titleBarOverlay, undefined);
      assert.equal(win.options.trafficLightPosition, undefined);
      assert.equal(win.options.width, 720);
      assert.equal(win.options.height, 560);
      assert.equal(win.options.minWidth, 560);
      assert.equal(win.options.minHeight, 440);
    } else {
      assert.equal(win.options.titleBarStyle, 'hidden');
      assert.equal(win.options.titleBarOverlay.height, 38);
    }
    assert.equal(win.shown, 0);
    win.emit('ready-to-show');
    assert.equal(win.shown, 0);
    f.handlers.get('hud-panel:ready')({ sender: {} });
    assert.equal(win.shown, 0);
    f.handlers.get('hud-panel:prepared')({ sender: win.webContents });
    f.handlers.get('hud-panel:ready')({ sender: win.webContents });
    assert.equal(await opening, true);
    assert.equal(win.shown, 1);
    assert.match(win.url, new RegExp(`hud-panel.html\\?panel=${role}`));
    f.manager.destroy();
  });
}
for (const modifier of ['control', 'meta']) {
  test(`${modifier}+W closes only Projects before renderer and menu shortcuts`, async () => {
    const f = fixture();
    const projects = f.open('projects');
    const settings = f.open('settings');
    f.windows.forEach(f.ready);
    await Promise.all([projects, settings]);
    let prevented = 0;
    f.windows[0].webContents.emit(
      'before-input-event',
      { preventDefault: () => prevented++ },
      {
        type: 'keyDown',
        key: 'W',
        [modifier]: true,
      },
    );
    assert.equal(prevented, 1);
    assert.equal(f.windows[0].isVisible(), false);
    assert.equal(f.windows[0].isDestroyed(), false);
    assert.equal(f.windows[1].isDestroyed(), false);
    assert.equal(f.sent.length, 0);
    f.windows[0].destroy();
    // A queued event from the old renderer cannot close its replacement.
    const replacement = f.open('projects');
    f.ready(f.windows[2]);
    await replacement;
    f.windows[0].webContents.emit(
      'before-input-event',
      { preventDefault: () => prevented++ },
      {
        type: 'keyDown',
        key: 'w',
        [modifier]: true,
      },
    );
    assert.equal(prevented, 1);
    assert.equal(f.windows[2].isDestroyed(), false);
    f.manager.destroy();
  });
}
test('Projects leaves ordinary typing and other shortcuts alone; Settings keeps its native controls', async () => {
  const f = fixture();
  const projects = f.open('projects');
  const settings = f.open('settings');
  f.windows.forEach(f.ready);
  await Promise.all([projects, settings]);
  let prevented = 0;
  const event = { preventDefault: () => prevented++ };
  for (const input of [
    { type: 'keyDown', key: 'w' },
    { type: 'keyUp', key: 'w', control: true },
    { type: 'keyDown', key: 'q', control: true },
    { type: 'keyDown', key: 'w', control: true, shift: true },
    { type: 'keyDown', key: 'w', control: true, alt: true },
  ])
    f.windows[0].webContents.emit('before-input-event', event, input);
  f.windows[1].webContents.emit('before-input-event', event, {
    type: 'keyDown',
    key: 'w',
    control: true,
  });
  assert.equal(prevented, 0);
  assert.equal(
    f.windows.every((win) => !win.isDestroyed()),
    true,
  );
  f.manager.destroy();
});
for (const role of ['settings', 'projects'])
  test(`reuses ${role} and creates a fresh renderer after destruction`, async () => {
    const f = fixture();
    const first = f.open(role);
    f.ready(f.windows[0]);
    await first;
    await f.open(role);
    assert.equal(f.windows.length, 1);
    f.windows[0].destroy();
    const replacement = f.open(role);
    f.ready(f.windows[1]);
    await replacement;
    assert.equal(f.windows.length, 2);
    f.manager.destroy();
  });
test('loads the packaged entry and preserves separate settings and projects lifetimes', async () => {
  const f = fixture({ packaged: true });
  const settings = f.open('settings');
  const projects = f.open('projects');
  for (const win of f.windows) f.ready(win);
  await Promise.all([settings, projects]);
  assert.equal(f.windows[0].file, '/beam/dist/html/hud-panel.html');
  assert.equal(f.windows[0].query.panel, 'settings');
  assert.equal(f.windows[1].query.panel, 'projects');
  assert.equal(f.handlers.has('hud:open-mascot'), false);
  assert.equal(f.handlers.has('developer:open-mascot-lab'), false);
  assert.equal(f.handlers.has('developer:open-devtools'), false);
  f.windows[0].close();
  assert.equal(f.windows[1].isDestroyed(), false);
  f.manager.destroy();
});

test('only the Settings window opens detached DevTools in development', async () => {
  const f = fixture();
  const opening = f.open('settings');
  const settings = f.windows[0];
  f.ready(settings);
  await opening;
  const open = f.handlers.get('developer:open-devtools');
  assert.throws(() => open({ sender: f.hud.webContents }), /not available/);
  assert.throws(() => open({ sender: {} }), /not available/);
  open({ sender: settings.webContents });
  assert.deepEqual(settings.devtools, [{ mode: 'detach' }]);
  f.stop();
  assert.throws(() => open({ sender: settings.webContents }), /not available/);
  f.manager.destroy();
});

test('Mascot Lab is independent, reuses its window and waits for both readiness signals', async () => {
  const f = fixture();
  const opening = f.open('settings');
  const settings = f.windows[0];
  f.ready(settings);
  await opening;
  const open = () =>
    f.handlers.get('developer:open-mascot-lab')({
      sender: settings.webContents,
    });
  const pending = open();
  const lab = f.windows[1];
  assert.equal(lab.options.title, 'Beam Mascot Lab');
  assert.equal(lab.options.parent, undefined);
  assert.equal(lab.options.width, 1280);
  assert.equal(lab.options.minWidth, 960);
  assert.equal(lab.options.transparent, false);
  lab.emit('ready-to-show');
  assert.equal(lab.shown, 0);
  f.handlers.get('hud-panel:prepared')({ sender: lab.webContents });
  f.handlers.get('hud-panel:ready')({ sender: lab.webContents });
  await pending;
  await open();
  assert.equal(f.windows.length, 2);
  assert.equal(lab.shown, 2);
  assert.match(lab.url, /hud-panel.html\?panel=mascot/);
  lab.close();
  assert.equal(settings.isDestroyed(), false);
  const replacement = open();
  f.ready(f.windows[2]);
  await replacement;
  f.manager.destroy();
});

test('Mascot Lab rejects foreign senders, recovers from failed loading and refuses work during shutdown', async () => {
  const f = fixture();
  const handler = f.handlers.get('developer:open-mascot-lab');
  assert.throws(() => handler({ sender: f.hud.webContents }), /not available/);
  assert.throws(() => handler({ sender: {} }), /not available/);
  const opening = f.open('settings');
  const settings = f.windows[0];
  f.ready(settings);
  await opening;
  const pending = handler({ sender: settings.webContents });
  f.windows[1].webContents.emit('did-fail-load', {}, -2, 'missing', '', true);
  await assert.rejects(pending, /Could not load/);
  assert.equal(f.windows[1].isDestroyed(), true);
  const retry = handler({ sender: settings.webContents });
  f.ready(f.windows[2]);
  await retry;
  f.stop();
  assert.throws(() => handler({ sender: settings.webContents }), /not available/);
  f.manager.destroy();
});
test('only the HUD may open panels, and unavailable recorder states reject the request', () => {
  const f = fixture();
  for (const role of ['settings', 'projects']) {
    assert.throws(() => f.handlers.get(`hud:open-${role}`)({ sender: {} }), /not available/);
  }
  f.controller.mode = 'recorder';
  assert.throws(() => f.open('projects'), /not available/);
  f.controller.mode = 'hud';
  f.stop();
  assert.throws(() => f.open('settings'), /not available/);
  assert.equal(f.windows.length, 0);
  f.manager.destroy();
});
test('only the project window may request a validated project; selection delegates to the HUD', async () => {
  const f = fixture();
  const opening = f.open('projects');
  const win = f.windows[0];
  f.ready(win);
  await opening;
  const select = f.handlers.get('hud-panel:open-project');
  const request = {
    id: '019f84dd-4d9d-7f61-ac30-5da50169ecbc',
    mode: 'screenshot',
  };
  assert.throws(() => select({ sender: f.hud.webContents }, request), /not available/);
  for (const invalid of [
    null,
    {},
    { ...request, id: '../file' },
    { ...request, id: [request.id] },
    { ...request, mode: 'other' },
  ]) {
    assert.throws(() => select({ sender: win.webContents }, invalid), /Invalid project/);
  }
  assert.equal(select({ sender: win.webContents }, request), true);
  assert.deepEqual(f.sent, [['hud:open-project', request]]);
  assert.equal(win.isDestroyed(), false);
  assert.equal(win.isVisible(), false);
  f.manager.destroy();
});
for (const role of ['settings', 'projects'])
  test(`a failed ${role} renderer permits an independent retry`, async () => {
    const f = fixture();
    const opening = f.open(role);
    f.windows[0].webContents.emit('did-fail-load', {}, -2, 'No renderer', '', true);
    await assert.rejects(opening, /Could not load/);
    assert.equal(f.windows[0].isDestroyed(), true);
    const retry = f.open(role);
    f.ready(f.windows[1]);
    assert.equal(await retry, true);
    f.manager.destroy();
  });
test('destroy and renderer loss reject pending opens without leaving windows alive', async () => {
  const f = fixture();
  const settings = f.open('settings');
  const projects = f.open('projects');
  f.windows[0].webContents.emit('render-process-gone');
  f.manager.destroy();
  await assert.rejects(settings, /renderer stopped/);
  await assert.rejects(projects, /window was closed/);
  assert.equal(
    f.windows.every((win) => win.isDestroyed()),
    true,
  );
});

for (const role of ['settings', 'projects']) {
  test(`${role} closes to a hidden, demoted shell and remounts content without another renderer load`, async () => {
    const f = fixture();
    const opening = f.open(role),
      win = f.windows[0];
    f.ready(win);
    await opening;
    assert.equal(win.topmost, true);
    win.close();
    assert.equal(win.destroyed, false);
    assert.equal(win.visible, false);
    assert.equal(win.topmost, false);
    assert.deepEqual(win.visibility.at(-1), ['hud-panel:visibility', false]);
    const again = f.open(role);
    assert.equal(f.windows.length, 1);
    assert.equal(win.visible, false);
    assert.deepEqual(win.visibility.at(-1), ['hud-panel:visibility', true]);
    f.handlers.get('hud-panel:ready')({ sender: win.webContents });
    await again;
    assert.equal(win.visible, true);
    assert.equal(win.topmost, true);
    f.manager.destroy();
    assert.equal(win.destroyed, true);
  });
}
test('warmup prepares at most two hidden shells only after capture readiness and HUD visibility', async () => {
  let resolve;
  const captureWarmup = new Promise((done) => {
    resolve = done;
  });
  const f = fixture({ captureWarmup });
  await Promise.resolve();
  assert.equal(f.windows.length, 0);
  f.hud.visible = true;
  f.hud.emit('show');
  assert.equal(f.windows.length, 0);
  resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.windows.length, 2);
  for (const win of f.windows) {
    assert.equal(win.visible, false);
    assert.equal(win.topmost, false);
    assert.deepEqual(win.visibility, []);
    f.ready(win);
    assert.deepEqual(win.visibility, []);
    assert.deepEqual(win.throttling, [true]);
  }
  await f.manager.prepare();
  await f.manager.prepare();
  f.hud.emit('show');
  assert.equal(f.windows.length, 2);
  f.manager.destroy();
  assert.equal(f.hud.listenerCount('show'), 0);
  assert.equal(f.hud.listenerCount('hide'), 0);
});
test('a hidden or unavailable HUD and a disposed manager never prepare new shells', async () => {
  const f = fixture();
  await f.manager.prepare();
  assert.equal(f.windows.length, 0);
  f.hud.visible = true;
  f.controller.mode = 'recorder';
  await f.manager.prepare();
  assert.equal(f.windows.length, 0);
  f.controller.mode = 'hud';
  f.stop();
  await f.manager.prepare();
  assert.equal(f.windows.length, 0);
  f.manager.destroy();
  await f.manager.prepare();
  assert.equal(f.windows.length, 0);
  assert.throws(() => f.open('settings'), /not available/);
});
test('shell readiness does not present a feature before its own mounted ready signal', async () => {
  const f = fixture({ visible: true });
  const prepared = f.manager.prepare();
  for (const win of f.windows) f.ready(win);
  await prepared;
  const win = f.windows[0],
    opening = f.open('settings');
  assert.equal(win.visible, false);
  assert.equal(win.throttling.at(-1), true);
  f.handlers.get('hud-panel:ready')({ sender: f.windows[1].webContents });
  assert.equal(win.visible, false);
  f.handlers.get('hud-panel:ready')({ sender: win.webContents });
  await opening;
  assert.equal(win.visible, true);
  f.manager.destroy();
});
test('topmost follows the HUD preference and demotes on minimize, with no reentrant native updates', async () => {
  const f = fixture(),
    opening = f.open('settings'),
    win = f.windows[0];
  f.ready(win);
  await opening;
  const count = win.topmostCalls.length;
  win.setAlwaysOnTop = (value) => {
    win.topmost = value;
    win.topmostCalls.push([value]);
    win.emit('focus');
  };
  win.emit('focus');
  assert.equal(win.topmostCalls.length, count);
  f.hud.topmost = false;
  f.hud.emit('always-on-top-changed');
  assert.equal(win.topmost, false);
  f.hud.topmost = true;
  f.hud.emit('always-on-top-changed');
  assert.equal(win.topmost, true);
  win.minimized = true;
  win.emit('minimize');
  assert.equal(win.topmost, false);
  win.restore();
  assert.equal(win.topmost, true);
  win.close();
  assert.equal(win.topmost, false);
  f.hud.emit('always-on-top-changed');
  assert.equal(win.topmost, false);
  f.manager.destroy();
});
test('panels stay ordinary windows when the HUD always-on-top preference is off', async () => {
  const f = fixture();
  f.hud.topmost = false;
  const opening = f.open('projects');
  f.ready(f.windows[0]);
  await opening;
  assert.equal(f.windows[0].topmost, false);
  f.manager.destroy();
});
test('hiding the HUD dismisses visible panels and rejects an incomplete presentation', async () => {
  const f = fixture(),
    opening = f.open('settings');
  f.ready(f.windows[0]);
  await opening;
  const pending = f.open('projects');
  f.hud.emit('hide');
  await assert.rejects(pending, /not available/);
  assert.equal(f.windows[0].destroyed, false);
  assert.equal(f.windows[0].visible, false);
  assert.equal(f.windows[1].destroyed, true);
  f.manager.destroy();
});
test('a recorder mode change before feature readiness rejects and destroys only that attempt', async () => {
  const f = fixture(),
    opening = f.open('projects');
  f.controller.mode = 'recorder';
  f.ready(f.windows[0]);
  await assert.rejects(opening, /not available/);
  f.manager.destroy();
});
test('unresponsive and loading deadlines dispose attempts and allow a new request', async (t) => {
  const f = fixture(),
    opening = f.open('settings');
  f.windows[0].emit('unresponsive');
  await assert.rejects(opening, /unresponsive/);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const retry = f.open('settings');
  t.mock.timers.tick(30_000);
  await assert.rejects(retry, /did not finish loading|was closed/);
  t.mock.timers.reset();
  f.manager.destroy();
});
test('hidden cached panels cannot request a project or open developer tools', async () => {
  const f = fixture(),
    opening = f.open('projects');
  f.ready(f.windows[0]);
  await opening;
  f.windows[0].close();
  assert.throws(
    () => f.handlers.get('hud-panel:open-project')({ sender: f.windows[0].webContents }, {}),
    /not available/,
  );
  const settings = f.open('settings');
  f.ready(f.windows[1]);
  await settings;
  f.windows[1].close();
  assert.throws(() => f.handlers.get('developer:open-devtools')({ sender: f.windows[1].webContents }), /not available/);
  f.manager.destroy();
});
test('packaged Settings carries an installed marker and exposes no developer handlers', async () => {
  const f = fixture({ packaged: true }),
    opening = f.open('settings');
  assert.deepEqual(f.windows[0].options.webPreferences.additionalArguments, ['--beam-installed']);
  assert.equal(f.handlers.has('developer:open-devtools'), false);
  assert.equal(f.handlers.has('developer:open-mascot-lab'), false);
  f.ready(f.windows[0]);
  await opening;
  f.manager.destroy();
});
