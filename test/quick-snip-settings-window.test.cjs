const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { createQuickSnipSettingsWindow } = require('../apps/desktop/electron/quick-snip/quick-snip-settings-window.cjs');
const area = { x: -1920, y: -100, width: 1920, height: 1080 };
const anchor = { x: 500, y: 26, width: 32, height: 32 };
function fixture(overrides = {}) {
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.destroyed = false;
      this.visible = false;
      this.webContents = new EventEmitter();
      this.sent = [];
      this.webContents.send = (...value) => this.sent.push(value);
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    setIgnoreMouseEvents(value) {
      this.ignoresMouse = value;
    }
    setContentProtection() {}
    setAlwaysOnTop() {}
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
    loadFile(file, options) {
      this.file = { file, options };
      return Promise.resolve();
    }
    setBounds(bounds) {
      this.bounds = bounds;
    }
    show() {
      this.visible = true;
    }
    focus() {
      this.focused = true;
    }
    hide() {
      this.visible = false;
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const parent = new EventEmitter();
  parent.focused = false;
  parent.isFocused = () => parent.focused;
  parent.isDestroyed = () => false;
  parent.getBounds = () => ({ x: -1500, y: 850, width: 632, height: 84 });
  parent.focus = () => {
    parent.focused = true;
  };
  parent.sent = [];
  parent.webContents = { send: (...args) => parent.sent.push(args) };
  const settings = createQuickSnipSettingsWindow({
    BrowserWindow: Window,
    applicationRoot: '/beam',
    isPackaged: false,
    screen: { getDisplayMatching: () => ({ workArea: area }) },
    environment: {},
    ...overrides,
  });
  const open = () => {
    settings.toggle(parent, { name: 'job' }, anchor);
    const target = windows.at(-1);
    target.emit('ready-to-show');
    settings.ready(target.webContents);
    settings.fit(target.webContents, 302);
    return target;
  };
  return { settings, windows, parent, open };
}
for (const [environment, origin] of [
  [{}, 'http://localhost:6500'],
  [{ BEAM_DEV_SERVER_URL: 'http://localhost:6512' }, 'http://localhost:6512'],
  [{ BEAM_DEV_SERVER_URL: 'http://127.0.0.1:6513' }, 'http://127.0.0.1:6513'],
])
  test(`settings use their session origin ${origin}`, () => {
    const f = fixture({ environment });
    try {
      const w = f.open();
      assert.equal(w.url, `${origin}/html/index.html?quickSnipSettings=1`);
    } finally {
      f.settings.destroy();
    }
  });
test('packaged settings load the bundled document independently of development ports', () => {
  const f = fixture({ isPackaged: true });
  try {
    assert.deepEqual(f.open().file, {
      file: '/beam/dist/html/index.html',
      options: { query: { quickSnipSettings: '1' } },
    });
  } finally {
    f.settings.destroy();
  }
});
test('waits for native and mounted readiness and ignores foreign senders', () => {
  const f = fixture();
  f.settings.toggle(f.parent, { name: 'job' }, anchor);
  const w = f.windows[0];
  w.emit('ready-to-show');
  f.settings.ready({});
  assert.equal(w.visible, false);
  f.settings.ready(w.webContents);
  assert.equal(w.visible, false);
  f.settings.fit(w.webContents, 302);
  assert.equal(w.visible, true);
  assert.deepEqual(
    w.sent.find(([channel]) => channel === 'quick-snip:configure'),
    ['quick-snip:configure', { name: 'job' }],
  );
  assert.equal(w.options.parent, f.parent);
  assert.equal(w.options.hasShadow, false);
  f.settings.destroy();
});
for (const [requested, expected] of [
  [100, 226],
  [302, 328],
  [1000, 446],
])
  test(`fits settings content ${requested} with shadow and pointer margins`, () => {
    const f = fixture();
    const w = f.open();
    f.settings.fit(w.webContents, requested);
    assert.equal(w.bounds.height, expected);
    assert.equal(w.bounds.y + expected, f.parent.getBounds().y + anchor.y);
    assert.equal(f.parent.getBounds().height, 84);
    f.settings.destroy();
  });
test('rejects malformed measurements and anchors before opening an owner surface', () => {
  const f = fixture();
  for (const invalid of [null, { ...anchor, x: -1 }, { ...anchor, width: Infinity }, { ...anchor, x: 620 }])
    assert.throws(() => f.settings.toggle(f.parent, {}, invalid), /anchor/);
  const w = f.open();
  const before = { ...w.bounds };
  f.settings.fit({}, 300);
  for (const h of [0, -20, NaN, Infinity, 2.5, '300']) f.settings.fit(w.webContents, h);
  assert.deepEqual(w.bounds, before);
  f.settings.destroy();
});
test('closing while loading cannot present the canceled panel', () => {
  const f = fixture();
  f.settings.toggle(f.parent, {}, anchor);
  f.settings.hide();
  const w = f.windows[0];
  w.emit('ready-to-show');
  f.settings.ready(w.webContents);
  assert.equal(w.visible, false);
  f.settings.destroy();
});
test('clicking Settings again closes it even after native focus moves to the toolbar', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const w = f.open();
  w.emit('blur');
  f.parent.focused = true;
  t.mock.timers.tick(60);
  assert.equal(w.visible, true);
  f.settings.toggle(f.parent, {}, anchor);
  assert.equal(w.ignoresMouse, true);
  t.mock.timers.tick(150);
  assert.equal(w.visible, false);
  assert.deepEqual(f.parent.sent.at(-1), ['quick-snip:settings-visibility', false]);
  f.settings.destroy();
});
test('outside focus closes settings, while moving or closing its parent dismisses immediately', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let w = f.open();
  w.emit('blur');
  t.mock.timers.tick(60);
  t.mock.timers.tick(150);
  assert.equal(w.visible, false);
  w = f.open();
  f.parent.emit('move');
  assert.equal(w.visible, false);
  w = f.open();
  f.parent.emit('closed');
  assert.equal(w.visible, false);
  f.settings.destroy();
});
for (const event of ['unresponsive', 'render-process-gone'])
  test(`${event} disposes the renderer and permits retry`, () => {
    const f = fixture();
    const w = f.open();
    (event === 'unresponsive' ? w : w.webContents).emit(event);
    assert.equal(w.destroyed, true);
    f.open();
    assert.equal(f.windows.length, 2);
    assert.equal(f.settings.owns(w.webContents), false);
    f.settings.destroy();
  });
const device = {
  kind: 'microphone',
  selectedId: 'off',
  position: { x: 350, y: 58 },
  options: [
    { id: 'mic', label: 'USB' },
    { id: 'off', label: 'Off' },
  ],
};
test('device choices use the same owned surface and accept only advertised identifiers from its renderer', async () => {
  const f = fixture();
  const pending = f.settings.chooseDevice(f.parent, device);
  const w = f.windows[0];
  w.emit('ready-to-show');
  f.settings.ready(w.webContents);
  f.settings.fit(w.webContents, 72);
  assert.deepEqual(w.sent.find(([c]) => c === 'quick-snip:settings-content')[1].device, device);
  f.settings.selectDevice({}, 'mic');
  assert.equal(w.visible, true);
  assert.throws(() => f.settings.selectDevice(w.webContents, 'untrusted'), /Unknown/);
  f.settings.selectDevice(w.webContents, 'mic');
  assert.equal(await pending, 'mic');
  assert.equal(w.visible, false);
  f.settings.destroy();
});
for (const close of ['hide', 'destroy'])
  test(`${close} cancels pending device selection`, async () => {
    const f = fixture();
    const pending = f.settings.chooseDevice(f.parent, device);
    f.settings[close]();
    assert.equal(await pending, null);
    f.settings.destroy();
  });
test('device window failure rejects its pending request without leaking listeners', async () => {
  const f = fixture();
  const pending = f.settings.chooseDevice(f.parent, device);
  f.windows[0].emit('unresponsive');
  await assert.rejects(pending, /unavailable/);
  f.settings.destroy();
  assert.equal(f.parent.listenerCount('move'), 0);
});

test('each reopening waits for a fresh content measurement and anchors the fitted panel to the cog', () => {
  const f = fixture();
  const first = f.open();
  const bounds = { ...first.bounds };
  f.settings.hide();
  for (let n = 0; n < 3; n++) {
    f.settings.toggle(f.parent, {}, anchor);
    assert.equal(first.visible, false);
    f.settings.fit(first.webContents, 302);
    assert.equal(first.visible, true);
    assert.deepEqual(first.bounds, bounds);
    f.settings.hide();
  }
  f.settings.destroy();
});
test('unchanged measurements do not create a positioning feedback loop', () => {
  const f = fixture();
  const w = f.open();
  const count = w.sent.length;
  f.settings.fit(w.webContents, 302);
  assert.equal(w.sent.length, count);
  f.settings.destroy();
});
test('a canceled opening cannot become visible when its late measurement arrives', () => {
  const f = fixture();
  f.settings.toggle(f.parent, {}, anchor);
  const w = f.windows[0];
  w.emit('ready-to-show');
  f.settings.ready(w.webContents);
  f.settings.hide();
  f.settings.fit(w.webContents, 302);
  assert.equal(w.visible, false);
  f.settings.destroy();
});

test('prepares one hidden renderer only while a toolbar exists and retains it after readiness', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.settings.prepare(f.parent, { name: 'job' });
  const w = f.windows[0];
  assert.equal(w.visible, false);
  w.emit('ready-to-show');
  f.settings.ready(w.webContents);
  t.mock.timers.tick(30000);
  assert.equal(w.destroyed, false);
  f.settings.prepare(f.parent, {});
  assert.equal(f.windows.length, 1);
  f.settings.toggle(f.parent, {}, anchor);
  f.settings.fit(w.webContents, 302);
  assert.equal(w.visible, true);
  f.settings.destroy();
});
test('reopening during the close morph cancels its hide deadline and restores mouse handling', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const w = f.open();
  f.settings.dismiss();
  assert.equal(w.ignoresMouse, true);
  f.settings.toggle(f.parent, {}, anchor);
  f.settings.fit(w.webContents, 302);
  assert.equal(w.ignoresMouse, false);
  t.mock.timers.tick(150);
  assert.equal(w.visible, true);
  f.settings.destroy();
});
test('capture teardown hides immediately even while a close morph is pending', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  const w = f.open();
  f.settings.dismiss();
  f.settings.hide();
  assert.equal(w.visible, false);
  t.mock.timers.tick(150);
  assert.equal(w.visible, false);
  f.settings.destroy();
});
for (const platform of ['linux', 'darwin', 'win32'])
  test(`${platform} uses the menu window presentation policy`, () => {
    const f = fixture({ platform });
    const w = f.open();
    assert.equal(w.options.type, platform === 'linux' ? 'popup-menu' : undefined);
    assert.equal(w.options.animationBehavior, platform === 'darwin' ? 'none' : undefined);
    f.settings.destroy();
  });
