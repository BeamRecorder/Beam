const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createDevelopmentSourceProvider } = require('../electron/source-picker/development-source-provider.cjs');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const { createSourcePickerController } = require('../electron/source-picker/source-picker-controller.cjs');
const path = require('node:path');

function fixture(options = {}) {
  const windows = [];
  const handlers = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.handle = (name, listener) => handlers.set(name, listener);
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.visible = false;
      this.destroyed = false;
      this.calls = [];
      this.webContents = new EventEmitter();
      this.webContents.send = (channel, value) => this.calls.push(['send', channel, value]);
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    isVisible() {
      return this.visible;
    }
    setContentProtection(value) {
      this.calls.push(['protected', value]);
    }
    setIgnoreMouseEvents(value) {
      this.calls.push(['mouse', value]);
    }
    setVisibleOnAllWorkspaces(...values) {
      this.calls.push(['workspaces', ...values]);
    }
    setBounds(value) {
      this.bounds = value;
      this.calls.push(['bounds', value]);
    }
    focus() {
      this.calls.push(['focus']);
    }
    show() {
      this.visible = true;
      this.calls.push(['show']);
    }
    showInactive() {
      this.visible = true;
      this.calls.push(['inactive']);
    }
    moveTop() {
      this.calls.push(['top']);
    }
    hide() {
      this.visible = false;
      this.calls.push(['hide']);
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
    loadFile(file, options) {
      this.file = file;
      this.query = options.query;
      return Promise.resolve();
    }
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
  }
  const hudWindow = new EventEmitter();
  hudWindow.webContents = {};
  hudWindow.getBounds = () => ({ x: -1500, y: 100, width: 672, height: 268 });
  hudWindow.isVisible = () => true;
  hudWindow.isDestroyed = () => false;
  hudWindow.focus = () => {};
  const display = {
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 24, width: 1920, height: 1056 },
  };
  const provider = createDevelopmentSourceProvider(display.bounds);
  const controller = createSourcePickerController({
    BrowserWindow: Window,
    screen: { getDisplayMatching: () => display },
    hudWindow,
    applicationRoot: '/beam',
    isPackaged: false,
    platform: 'linux',
    provider,
    ...options,
  });
  const ready = (target) => {
    target.emit('ready-to-show');
    controller.markReady(target.webContents);
  };
  const act = (action) => controller.action(action);
  const latest = (target) => target.calls.filter(([type]) => type === 'send').at(-1)?.[2];
  return { controller, windows, hudWindow, handlers, ipcMain, ready, act, latest, provider };
}

test('development surfaces load their moved HTML with the owning role', async () => {
  const { controller, windows } = fixture();
  const result = controller.open('window');
  await flush();
  for (const window of windows) {
    assert.match(window.url, /^http:\/\/localhost:6500\/html\/source-picker\.html\?role=(chooser|aura|target)$/);
  }
  controller.action({ type: 'cancel' });
  assert.equal(await result, null);
});

test('packaged surfaces load the same document from dist/html', async () => {
  const { controller, windows } = fixture({ isPackaged: true });
  const result = controller.open('window');
  await flush();
  for (const window of windows) {
    assert.equal(window.file, path.join('/beam', 'dist/html/source-picker.html'));
    assert.ok(['chooser', 'aura', 'target'].includes(window.query.role));
  }
  controller.action({ type: 'cancel' });
  assert.equal(await result, null);
});

test('shared chooser waits for its renderer and development targets/aura are click-through', async () => {
  const { controller, windows, ready, act, latest } = fixture({ platform: 'darwin' });
  const result = controller.open('window');
  await flush();
  assert.equal(windows.length, 3);
  assert.equal(windows[0].options.focusable, false);
  assert.equal(windows[1].options.focusable, false);
  assert.equal(windows[2].options.focusable, true);
  windows[2].emit('ready-to-show');
  controller.markReady({});
  assert.equal(windows[2].visible, false);
  windows.forEach(ready);
  assert.equal(windows[2].visible, true);
  assert.equal(windows[2].calls.filter(([name]) => name === 'focus').length, 1);
  assert.equal(controller.ownsChooser(windows[0].webContents), false);
  assert.equal(controller.ownsChooser(windows[2].webContents), true);
  act({ type: 'hover', id: 'demo-window-1' });
  await flush();
  assert.equal(windows[0].visible, true);
  assert.equal(windows[1].visible, true);
  assert.equal(latest(windows[2]).selectedId, null);
  assert.ok(windows[0].calls.some(([name]) => name === 'inactive'));
  assert.ok(windows[1].calls.some(([name, value]) => name === 'mouse' && value === true));
  act({ type: 'select', id: 'demo-window-1' });
  await flush();
  const bounds = { ...windows[1].bounds };
  act({ type: 'hover', id: 'demo-window-16' });
  await flush();
  assert.deepEqual(windows[1].bounds, bounds);
  act({ type: 'confirm' });
  assert.ok(windows.every((target) => target.destroyed));
  const selection = await result;
  assert.equal(selection.id, 'demo-window-1');
  assert.equal(selection.development, true);
});
test('single native display skips the overlay, while empty and multi-display catalogues use the chooser', async () => {
  const display = { id: 'native:screen', kind: 'screen', name: 'Screen', app: '', detail: '', aspect: 1.6 };
  const one = fixture({ provider: { development: false, list: async () => [display] } });
  assert.equal((await one.controller.open('screen')).id, display.id);
  assert.equal(one.windows.length, 0);
  for (const sources of [[], [display, { ...display, id: 'native:screen2' }]]) {
    const { controller, windows } = fixture({ provider: { development: false, list: async () => sources } });
    const result = controller.open('screen');
    await flush();
    assert.equal(windows.length, 2);
    controller.action({ type: 'cancel' });
    await result;
  }
});
test('cancel during loading destroys surfaces and late events cannot revive a closed attempt', async () => {
  const { controller, windows, act } = fixture();
  const result = controller.open('window');
  await flush();
  act({ type: 'confirm' });
  assert.equal(
    windows.some((target) => target.destroyed),
    false,
  );
  act({ type: 'cancel' });
  assert.equal(await result, null);
  windows[2].emit('ready-to-show');
  controller.markReady(windows[2].webContents);
  assert.ok(windows.every((target) => target.destroyed && !target.visible));
  act({ type: 'confirm' });
  controller.destroy();
});
test('renderer failure disposes its attempt and allows retry', async () => {
  const { controller, windows, ready } = fixture();
  const result = controller.open('window');
  await flush();
  windows[0].webContents.emit('render-process-gone');
  await assert.rejects(result, /renderer stopped/);
  const next = controller.open('screen');
  await flush();
  const replacement = windows.slice(3);
  replacement.forEach(ready);
  windows[0].emit('ready-to-show');
  assert.equal(replacement[2].visible, true);
  controller.action({ type: 'cancel' });
  await next;
});
test('startup deadline and HUD closure clean up all pending surfaces', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { controller, windows, hudWindow } = fixture();
  const result = controller.open('window');
  await flush();
  context.mock.timers.tick(15_000);
  await assert.rejects(result, /did not become ready/);
  assert.ok(windows.every((target) => target.destroyed));
  const next = controller.open('screen');
  await flush();
  hudWindow.emit('closed');
  assert.equal(await next, null);
  assert.throws(() => controller.open('window'), /disposed/);
});
test('late native preview results are discarded after another target is hovered', async () => {
  const { controller, windows, provider, ready, latest } = fixture();
  let resolveFirst;
  const preview = provider.preview;
  provider.preview = (source) =>
    source.id === 'demo-window-1'
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : preview(source);
  const result = controller.open('window');
  await flush();
  windows.forEach(ready);
  controller.action({ type: 'hover', id: 'demo-window-1' });
  controller.action({ type: 'hover', id: 'demo-window-2' });
  resolveFirst({ bounds: { x: 9000, y: 0, width: 400, height: 400 }, thumbnail: 'stale' });
  await flush();
  assert.equal(latest(windows[2]).highlightedId, 'demo-window-2');
  assert.notEqual(windows[1].bounds.x, 9000);
  controller.action({ type: 'cancel' });
  await result;
});
test('failed live inspection hides stale aura and displays its native error', async () => {
  const { controller, windows, provider, ready, latest } = fixture();
  const result = controller.open('window');
  await flush();
  windows.forEach(ready);
  controller.action({ type: 'select', id: 'demo-window-1' });
  await flush();
  assert.equal(windows[1].visible, true);
  provider.preview = async () => {
    throw new Error('Window closed');
  };
  controller.action({ type: 'hover', id: 'demo-window-2' });
  await flush();
  assert.equal(windows[1].visible, false);
  assert.equal(latest(windows[2]).error, 'Window closed');
  controller.action({ type: 'cancel' });
  await result;
});

test('a failed hovered window does not remove the aura from another selected window', async () => {
  const { controller, windows, provider, ready, latest } = fixture();
  const result = controller.open('window');
  await flush();
  windows.forEach(ready);
  controller.action({ type: 'select', id: 'demo-window-1' });
  await flush();
  const selectedBounds = { ...windows[1].bounds };
  const preview = provider.preview;
  provider.preview = async (source) => {
    if (source.id === 'demo-window-2') throw new Error('Hovered window closed');
    return preview(source);
  };
  controller.action({ type: 'hover', id: 'demo-window-2' });
  await flush();
  assert.equal(windows[1].visible, true);
  assert.deepEqual(windows[1].bounds, selectedBounds);
  assert.equal(latest(windows[2]).error, 'Hovered window closed');
  controller.action({ type: 'cancel' });
  await result;
});
