const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { registerCapturePreparationIpc } = require('../apps/desktop/electron/window/capture-preparation-ipc.cjs');
const { capturePreparationApi } = require('../apps/desktop/electron/preload-capture-preparation.cjs');
const settings = {
  cameraId: 'off',
  microphoneId: 'no-audio',
  systemAudio: false,
  countdownSeconds: 3,
  hideTaskbar: false,
  hideDesktopIcons: false,
  showRealCursor: false,
  zoomMode: '2d',
};
function fixture(platform = 'linux') {
  const windows = [];
  class Window extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = options;
      this.bounds = options;
      this.destroyed = false;
      this.visible = false;
      this.webContents = new EventEmitter();
      this.webContents.sent = [];
      this.webContents.send = (...args) => this.webContents.sent.push(args);
      windows.push(this);
    }
    static fromWebContents(sender) {
      return windows.find((win) => win.webContents === sender);
    }
    isDestroyed() {
      return this.destroyed;
    }
    getBounds() {
      return this.bounds;
    }
    isFocused() {
      return false;
    }
    setBounds(bounds) {
      this.bounds = bounds;
    }
    setMinimumSize() {}
    setContentProtection() {}
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    show() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    focus() {}
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
    loadFile() {
      return Promise.resolve();
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const handlers = new Map(),
    listeners = new Map();
  const ipc = { handle: (id, fn) => handlers.set(id, fn), on: (id, fn) => listeners.set(id, fn) };
  const parent = new Window({ x: 200, y: 900, width: 800, height: 88 });
  const controller = { mode: 'preparation', window: parent };
  const service = registerCapturePreparationIpc(ipc, (win) => (win === parent ? controller : null), {
    BrowserWindow: Window,
    platform,
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    applicationRoot: '/beam',
    isPackaged: false,
    environment: {},
  });
  const invoke = (id, value, sender = parent.webContents) =>
    handlers.get(`capture-preparation:${id}`)({ sender }, value);
  const send = (id, value, sender = windows.at(-1).webContents) =>
    listeners.get(`capture-preparation:${id}`)({ sender }, value);
  const configure = () => invoke('configure', settings);
  const present = () => {
    const menu = windows.at(-1);
    menu.emit('ready-to-show');
    send('settings-ready');
    send('settings-fit', 300);
    return menu;
  };
  return { windows, parent, controller, invoke, send, configure, present, service };
}
test('keeps the menu hidden until requested, ready and measured, using the preparation protocol', () => {
  const f = fixture();
  f.configure();
  const menu = f.windows.at(-1);
  assert.match(menu.url, /capturePreparationSettings=1/);
  assert.equal(menu.visible, false);
  f.invoke('settings', { x: 600, y: 20, width: 28, height: 28 });
  assert.equal(menu.visible, false);
  f.present();
  assert.equal(menu.visible, true);
  assert.ok(
    menu.webContents.sent.some(
      ([channel, value]) => channel === 'capture-preparation:configure' && value.countdownSeconds === 3,
    ),
  );
  assert.equal(f.parent.getBounds().height, 88);
  f.service.close();
});
test('only the current preparation owner and its owned menu can alter settings', () => {
  const f = fixture();
  assert.throws(() => f.invoke('configure', settings, {}), /authorized/);
  f.controller.mode = 'hud';
  assert.throws(() => f.configure(), /authorized/);
  f.controller.mode = 'preparation';
  assert.throws(() => f.invoke('settings', {}), /unavailable/);
  assert.throws(() => f.invoke('configure', null), /required/);
  assert.throws(() => f.invoke('configure', { ...settings, countdownSeconds: 99 }), /countdown/);
  f.configure();
  assert.throws(() => f.invoke('update', settings), /authorized/);
  const menu = f.windows.at(-1);
  assert.throws(() => f.invoke('update', null, menu.webContents), /required/);
  f.invoke('update', { ...settings, countdownSeconds: 10 }, menu.webContents);
  assert.deepEqual(f.parent.webContents.sent.at(-1), [
    'capture-preparation:changed',
    { ...settings, countdownSeconds: 10 },
  ]);
  f.controller.mode = 'recorder';
  assert.throws(() => f.invoke('update', settings, menu.webContents), /authorized/);
  f.service.close();
});
const request = {
  kind: 'camera',
  selectedId: 'off',
  options: [
    { id: 'cam', label: 'Camera' },
    { id: 'off', label: 'Off' },
  ],
  position: { x: 200, y: 40 },
};
test('returns only a validated device choice from its own native menu', async () => {
  const f = fixture();
  f.configure();
  const pending = f.invoke('choose-device', request);
  const menu = f.present();
  f.send('device-select', 'cam', {});
  assert.equal(menu.visible, true);
  assert.throws(() => f.send('device-select', 'invented'), /Unknown/);
  f.send('device-select', 'cam');
  assert.equal(await pending, 'cam');
  assert.equal(menu.visible, false);
  f.service.close();
});
for (const event of ['hide', 'closed', 'capture-preparation-ended'])
  test(`releases a pending choice and destroys menus on ${event}`, async () => {
    const f = fixture();
    f.configure();
    const pending = f.invoke('choose-device', request);
    const menu = f.present();
    f.parent.emit(event);
    assert.equal(await pending, null);
    assert.equal(menu.destroyed, true);
    assert.equal(f.parent.listenerCount('hide'), 0);
    assert.equal(f.parent.listenerCount('capture-preparation-ended'), 0);
    f.service.close();
  });
test('rejects invalid devices and ignores foreign dismiss/close senders', async () => {
  const f = fixture();
  await assert.rejects(f.invoke('choose-device', request), /unavailable/);
  f.configure();
  await assert.rejects(f.invoke('choose-device', { ...request, options: [] }), /Invalid/);
  const menu = f.windows.at(-1);
  f.send('settings-dismiss', null, {});
  f.send('close', null, {});
  assert.equal(menu.destroyed, false);
  f.send('close', null, f.parent.webContents);
  assert.equal(menu.destroyed, true);
  f.service.close();
});
test('preload subscriptions use the preparation namespace and remove only their callback', async () => {
  const ipc = new EventEmitter();
  const calls = [];
  ipc.invoke = async (...args) => calls.push(args);
  ipc.send = (...args) => calls.push(args);
  const api = capturePreparationApi(ipc);
  let received;
  const off = api.onChanged((value) => {
    received = value;
  });
  ipc.emit('capture-preparation:changed', {}, settings);
  assert.equal(received, settings);
  off();
  assert.equal(ipc.listenerCount('capture-preparation:changed'), 0);
  for (const name of ['onConfigure', 'onContent', 'onSettingsVisibility']) api[name](() => {})();
  await api.fitBar(650);
  await api.configure(settings);
  await api.toggleSettings({});
  await api.chooseDevice(request);
  await api.update(settings);
  api.selectDevice('cam');
  api.ready();
  api.fit(300);
  api.dismiss();
  api.close();
  assert.equal(calls.length, 10);
  assert.ok(calls.every(([channel]) => channel.startsWith('capture-preparation:')));
});
test('fits only the owning preparation bar and preserves its native height', () => {
  const f = fixture();
  assert.throws(() => f.invoke('fit-bar', 650, {}), /authorized/);
  assert.equal(f.invoke('fit-bar', 650), 682);
  assert.equal(f.parent.getBounds().width, 682);
  assert.equal(f.parent.getBounds().height, 88);
  assert.equal(f.controller.preparationSize.width, 682);
  f.controller.mode = 'recorder';
  assert.throws(() => f.invoke('fit-bar', 650), /authorized/);
  f.service.close();
});
test('delegates Settings only from the active preparation owner or its owned menu', () => {
  const f = fixture();
  assert.equal(f.service.settingsOwnerFor(f.parent.webContents), null);
  f.configure();
  const menu = f.windows.at(-1);
  for (const sender of [f.parent.webContents, menu.webContents])
    assert.equal(f.service.settingsOwnerFor(sender), f.parent);
  assert.equal(f.service.settingsOwnerFor({}), null);
  f.controller.mode = 'recorder';
  assert.equal(f.service.settingsOwnerFor(menu.webContents), null);
  f.controller.mode = 'preparation';
  f.parent.emit('capture-preparation-ended');
  assert.equal(f.service.settingsOwnerFor(menu.webContents), null);
  f.service.close();
});
