const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  createDevelopmentSourceProvider,
} = require('../apps/desktop/electron/source-picker/development-source-provider.cjs');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const { createSourcePickerController } = require('../apps/desktop/electron/source-picker/source-picker-controller.cjs');
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
      this.bounds = {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      };
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
    setAlwaysOnTop(...values) {
      this.calls.push(['alwaysOnTop', ...values]);
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
      this.query = options?.query;
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
  hudWindow.focus = () => {
    hudWindow.focused = true;
  };
  const display = options.display ?? {
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 24, width: 1920, height: 1056 },
  };
  const provider = createDevelopmentSourceProvider(display.bounds);
  provider.development = options.development ?? false;
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
  return {
    controller,
    windows,
    hudWindow,
    handlers,
    ipcMain,
    ready,
    act,
    latest,
    provider,
  };
}

test('one transparent centered chooser remains owned above the HUD', async () => {
  const { controller, windows, hudWindow, ready } = fixture();
  const result = controller.open('window');
  await flush();
  assert.equal(windows.length, 1);
  const chooser = windows.at(-1);
  assert.equal(chooser.options.parent, hudWindow);
  assert.equal(chooser.options.transparent, true);
  assert.equal(chooser.options.frame, false);
  assert.equal(chooser.options.backgroundColor, '#00000000');
  assert.equal(chooser.options.alwaysOnTop, true);
  assert.ok(
    chooser.calls.some(([name, enabled, level]) => name === 'alwaysOnTop' && enabled && level === 'screen-saver'),
  );
  assert.equal(chooser.options.focusable, true);
  assert.deepEqual(chooser.bounds, {
    x: -1336,
    y: 440,
    width: 752,
    height: 200,
  });
  ready(chooser);
  assert.ok(chooser.calls.some(([name, value]) => name === 'mouse' && value === false));
  controller.action({ type: 'cancel' });
  assert.equal(await result, null);
  assert.equal(hudWindow.focused, true);
});

test('screen selection uses the same centered transparent preview without a full-display window', async () => {
  const { controller, windows, hudWindow } = fixture();
  const before = hudWindow.getBounds();
  const result = controller.open('screen');
  await flush();
  assert.equal(windows.length, 2);
  assert.deepEqual(windows.at(-1).bounds, {
    x: -1280,
    y: 440,
    width: 640,
    height: 200,
  });
  assert.deepEqual(hudWindow.getBounds(), before);
  controller.action({ type: 'cancel' });
  await result;
});

for (const platform of ['linux', 'win32', 'darwin']) {
  for (const kind of ['window', 'screen']) {
    test(`${platform} ${kind} backdrop stays below its topmost chooser in either readiness order`, async () => {
      for (const first of ['chooser', 'backdrop']) {
        const { controller, windows, ready } = fixture({
          platform,
          development: true,
        });
        const result = controller.open(kind);
        await flush();
        const [backdrop, chooser] = windows;
        assert.equal(backdrop.options.alwaysOnTop, false);
        assert.equal(backdrop.options.focusable, platform === 'linux');
        assert.equal(backdrop.options.parent, undefined);
        assert.ok(backdrop.calls.some(([name, ignore]) => name === 'mouse' && ignore));
        const order = [];
        backdrop.showInactive = () => {
          backdrop.visible = true;
          order.push('backdrop:show');
        };
        backdrop.moveTop = () => order.push('backdrop:raise');
        chooser.moveTop = () => order.push('chooser:raise');
        controller.action({
          type: 'hover',
          id: kind === 'window' ? 'demo-window-1' : 'demo-screen-1',
        });
        await flush();
        ready(first === 'chooser' ? chooser : backdrop);
        ready(first === 'chooser' ? backdrop : chooser);
        assert.equal(order.at(-1), 'chooser:raise');
        assert.equal(order.filter((action) => action === 'backdrop:raise').length, 1);
        assert.equal(
          backdrop.calls.some(([name]) => name === 'focus'),
          false,
        );
        const bounds = { ...backdrop.bounds };
        controller.action({
          type: 'hover',
          id: kind === 'window' ? 'demo-window-2' : 'demo-screen-2',
        });
        await flush();
        assert.deepEqual(backdrop.bounds, bounds);
        controller.action({ type: 'hover', id: null });
        assert.equal(backdrop.visible, false);
        controller.action({ type: 'cancel' });
        assert.equal(await result, null);
        assert.ok(windows.every((window) => window.destroyed));
      }
    });
  }
}

test('a stale raised source is still kept below the chooser after pointer exit', async () => {
  const { controller, windows, provider, ready } = fixture();
  let resolvePreview;
  provider.preview = () =>
    new Promise((resolve) => {
      resolvePreview = resolve;
    });
  const result = controller.open('window');
  await flush();
  const chooser = windows.at(-1);
  ready(chooser);
  controller.action({ type: 'hover', id: 'demo-window-1' });
  controller.action({ type: 'hover', id: null });
  const raises = chooser.calls.filter(([name]) => name === 'top').length;
  resolvePreview({ bounds: {}, thumbnail: 'discarded' });
  await flush();
  assert.equal(chooser.calls.filter(([name]) => name === 'top').length, raises + 1);
  controller.action({ type: 'cancel' });
  await result;
});

test('small display bounds clamp the entire chooser including negative origins', async () => {
  const display = {
    bounds: { x: 0, y: -600, width: 600, height: 400 },
    workArea: { x: 100, y: -480, width: 500, height: 240 },
  };
  const { controller, windows } = fixture({ display });
  const result = controller.open('window');
  await flush();
  assert.deepEqual(windows.at(-1).bounds, { ...display.workArea, height: 200 });
  controller.action({ type: 'cancel' });
  await result;
});

for (const kind of ['screen', 'window']) {
  test(`${kind} selection preserves the source bounds and destroys the chooser before countdown handoff`, async () => {
    const { controller, windows, ready, act, latest } = fixture();
    const result = controller.open(kind);
    await flush();
    ready(windows.at(-1));
    const source = latest(windows.at(-1)).sources.find((source) => source.kind === kind);
    const bounds = { ...source.bounds };
    act({ type: 'select', id: source.id });
    await flush();
    act({ type: 'confirm' });
    const selection = await result;
    assert.ok(windows.every((target) => target.destroyed));
    assert.equal(selection.id, source.id);
    assert.equal(selection.kind, kind);
    assert.equal(selection.development, false);
    assert.deepEqual(selection.source.bounds, bounds);
  });
}

test('hover raises real windows behind the chooser without activation or repeated resizing', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const source = {
    id: 'native:window:1',
    kind: 'window',
    name: 'Window',
    app: '',
    detail: '',
    aspect: 16 / 9,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    thumbnail: 'first-frame',
  };
  const calls = [];
  const { controller, windows, ready, latest } = fixture({
    provider: {
      development: false,
      list: async () => [source, { ...source, id: 'native:window:2', aspect: 0.6 }],
      preview: async (item, raise) => {
        calls.push([item.id, raise]);
        return { bounds: item.bounds, thumbnail: 'live-frame' };
      },
    },
  });
  const result = controller.open('window');
  await flush();
  ready(windows.at(-1));
  const bounds = { ...windows.at(-1).bounds };
  controller.action({ type: 'hover', id: source.id });
  await flush();
  assert.equal(latest(windows.at(-1)).sources[0].thumbnail, 'live-frame');
  controller.action({ type: 'hover', id: 'native:window:2' });
  await flush();
  context.mock.timers.tick(700);
  await flush();
  assert.deepEqual(
    calls.slice(0, 3).map(([, raise]) => raise),
    [true, true, false],
  );
  assert.deepEqual(windows.at(-1).bounds, bounds);
  assert.equal(windows.at(-1).calls.filter(([name]) => name === 'bounds' || name === 'inactive').length, 0);
  assert.equal(windows.at(-1).calls.filter(([name]) => name === 'focus').length, 1);
  assert.equal(windows.at(-1).calls.filter(([name]) => name === 'show').length, 1);
  controller.action({ type: 'cancel' });
  await result;
});

test('development and packaged choosers load the same source-selection entry', async () => {
  for (const isPackaged of [false, true]) {
    const { controller, windows } = fixture({ isPackaged });
    const result = controller.open('window');
    await flush();
    if (isPackaged) assert.equal(windows.at(-1).file, path.join('/beam', 'dist/html/source-picker.html'));
    else assert.equal(windows.at(-1).url, 'http://localhost:6500/html/source-picker.html?role=chooser');
    controller.action({ type: 'cancel' });
    assert.equal(await result, null);
  }
});

test('chooser presentation waits for native and owning renderer readiness', async () => {
  const { controller, windows, ready, latest } = fixture({
    platform: 'darwin',
  });
  const result = controller.open('window');
  await flush();
  windows.at(-1).emit('ready-to-show');
  controller.markReady({});
  assert.equal(windows.at(-1).visible, false);
  ready(windows.at(-1));
  assert.equal(windows.at(-1).visible, true);
  assert.equal(controller.ownsChooser({}), false);
  assert.equal(controller.ownsChooser(windows.at(-1).webContents), true);
  controller.action({ type: 'select', id: 'demo-window-1' });
  controller.action({ type: 'hover', id: 'demo-window-16' });
  await flush();
  assert.equal(latest(windows.at(-1)).highlightedId, 'demo-window-16');
  assert.equal(latest(windows.at(-1)).selectedId, 'demo-window-1');
  controller.action({ type: 'confirm' });
  assert.equal((await result).id, 'demo-window-1');
  assert.equal(controller.ownsChooser(undefined), false);
});

test('single native screen skips the chooser while empty and multi-screen catalogues show it', async () => {
  const display = {
    id: 'native:screen',
    kind: 'screen',
    name: 'Screen',
    app: '',
    detail: '',
    aspect: 1.6,
  };
  const one = fixture({
    provider: { development: false, list: async () => [display] },
  });
  assert.equal((await one.controller.open('screen')).id, display.id);
  assert.equal(one.windows.length, 0);
  for (const sources of [[], [display, { ...display, id: 'native:screen2' }]]) {
    const { controller, windows } = fixture({
      provider: { development: false, list: async () => sources },
    });
    const result = controller.open('screen');
    await flush();
    assert.equal(windows.length, 2);
    controller.action({ type: 'cancel' });
    await result;
  }
});

test('cancel during loading destroys the chooser and late readiness cannot revive it', async () => {
  const { controller, windows, act } = fixture();
  const result = controller.open('window');
  await flush();
  act({ type: 'confirm' });
  assert.equal(windows.at(-1).destroyed, false);
  act({ type: 'cancel' });
  assert.equal(await result, null);
  windows.at(-1).emit('ready-to-show');
  controller.markReady(windows.at(-1).webContents);
  assert.equal(windows.at(-1).destroyed, true);
  assert.equal(windows.at(-1).visible, false);
  act({ type: 'confirm' });
  controller.destroy();
});

test('renderer failure disposes its attempt and allows retry without stale callbacks', async () => {
  const { controller, windows, ready } = fixture();
  const result = controller.open('window');
  await flush();
  windows.at(-1).webContents.emit('render-process-gone');
  await assert.rejects(result, /renderer stopped/);
  const first = windows.at(-1);
  const next = controller.open('screen');
  await flush();
  ready(windows.at(-1));
  first.emit('ready-to-show');
  assert.equal(windows.at(-1).visible, true);
  controller.action({ type: 'cancel' });
  await next;
});

test('startup deadline and HUD closure clean up pending selection', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { controller, windows, hudWindow } = fixture();
  const result = controller.open('window');
  await flush();
  context.mock.timers.tick(15_000);
  await assert.rejects(result, /did not become ready/);
  assert.equal(windows.at(-1).destroyed, true);
  const next = controller.open('screen');
  await flush();
  hudWindow.emit('closed');
  assert.equal(await next, null);
  assert.throws(() => controller.open('window'), /disposed/);
});

test('late preview results are discarded when hover changes', async () => {
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
  ready(windows.at(-1));
  controller.action({ type: 'hover', id: 'demo-window-1' });
  controller.action({ type: 'hover', id: 'demo-window-2' });
  resolveFirst({
    bounds: { x: 9000, y: 0, width: 400, height: 400 },
    thumbnail: 'stale',
  });
  await flush();
  const state = latest(windows.at(-1));
  assert.equal(state.highlightedId, 'demo-window-2');
  assert.notEqual(state.sources.find((source) => source.id === 'demo-window-1').thumbnail, 'stale');
  controller.action({ type: 'cancel' });
  await result;
});

test('leaving a selected source keeps its real window visible and restores it after another hover', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { controller, windows, provider, ready, latest } = fixture();
  let count = 0;
  const preview = provider.preview;
  provider.preview = (source) => {
    count++;
    return preview(source);
  };
  const result = controller.open('window');
  await flush();
  ready(windows.at(-1));
  controller.action({ type: 'select', id: 'demo-window-1' });
  await flush();
  controller.action({ type: 'hover', id: null });
  await flush();
  const before = count;
  context.mock.timers.tick(3500);
  await flush();
  assert.ok(count > before);
  assert.equal(latest(windows.at(-1)).highlightedId, null);
  assert.equal(latest(windows.at(-1)).selectedId, 'demo-window-1');
  controller.action({ type: 'confirm' });
  assert.equal((await result).id, 'demo-window-1');
});

test('a pending preview cannot reappear or restart refreshes after pointer exit', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { controller, windows, provider, ready, latest } = fixture();
  let resolvePreview;
  let count = 0;
  provider.preview = () => {
    count++;
    return new Promise((resolve) => {
      resolvePreview = resolve;
    });
  };
  const result = controller.open('window');
  await flush();
  ready(windows.at(-1));
  controller.action({ type: 'hover', id: 'demo-window-1' });
  controller.action({ type: 'hover', id: null });
  resolvePreview({
    bounds: { x: 5000, y: 0, width: 10, height: 10 },
    thumbnail: 'stale',
  });
  await flush();
  context.mock.timers.tick(3500);
  await flush();
  assert.equal(count, 1);
  assert.equal(latest(windows.at(-1)).highlightedId, null);
  assert.notEqual(latest(windows.at(-1)).sources.find((source) => source.id === 'demo-window-1').thumbnail, 'stale');
  controller.action({ type: 'cancel' });
  await result;
});

test('failed hovered inspection reports the error while another selection stays confirmable', async () => {
  const { controller, windows, provider, ready, latest } = fixture();
  const result = controller.open('window');
  await flush();
  ready(windows.at(-1));
  controller.action({ type: 'select', id: 'demo-window-1' });
  await flush();
  const preview = provider.preview;
  provider.preview = async (source) => {
    if (source.id === 'demo-window-2') throw new Error('Window closed');
    return preview(source);
  };
  controller.action({ type: 'hover', id: 'demo-window-2' });
  await flush();
  assert.equal(latest(windows.at(-1)).error, 'Window closed');
  assert.equal(latest(windows.at(-1)).selectedId, 'demo-window-1');
  controller.action({ type: 'confirm' });
  assert.equal((await result).id, 'demo-window-1');
});

test('confirmation waits for stale hover inspection then raises only the clicked source last', async () => {
  const { controller, windows, provider, ready } = fixture();
  let resolveHover;
  const calls = [];
  const preview = provider.preview;
  provider.preview = (source, raise) => {
    calls.push([source.id, raise]);
    return source.id === 'demo-window-1'
      ? new Promise((resolve) => {
          resolveHover = resolve;
        })
      : preview(source);
  };
  const result = controller.open('window');
  await flush();
  ready(windows.at(-1));
  controller.action({ type: 'hover', id: 'demo-window-1' });
  controller.action({ type: 'select', id: 'demo-window-2' });
  controller.action({ type: 'confirm' });
  controller.action({ type: 'confirm' });
  assert.equal(calls.length, 1);
  resolveHover({ bounds: {}, thumbnail: 'stale' });
  assert.equal((await result).id, 'demo-window-2');
  assert.deepEqual(calls, [
    ['demo-window-1', true],
    ['demo-window-2', true],
  ]);
  assert.ok(windows.every((window) => window.destroyed));
});

test('cancelling during confirmation destroys both surfaces and cannot resume a late handoff', async () => {
  const { controller, windows, provider, ready } = fixture({
    development: true,
  });
  let resolveHover;
  let count = 0;
  provider.preview = () => {
    count++;
    return new Promise((resolve) => {
      resolveHover = resolve;
    });
  };
  const result = controller.open('window');
  await flush();
  windows.forEach(ready);
  controller.action({ type: 'select', id: 'demo-window-1' });
  controller.action({ type: 'confirm' });
  controller.action({ type: 'cancel' });
  assert.equal(await result, null);
  resolveHover({ bounds: {}, thumbnail: 'late' });
  await flush();
  assert.equal(count, 1);
  assert.ok(windows.every((window) => window.destroyed));
});

test('a failed confirmation retains the chooser and can be retried with the exact selected source', async () => {
  const { controller, windows, provider, ready, latest } = fixture();
  const result = controller.open('window');
  await flush();
  const chooser = windows.at(-1);
  ready(chooser);
  controller.action({ type: 'select', id: 'demo-window-1' });
  await flush();
  const preview = provider.preview;
  provider.preview = async () => {
    throw new Error('Target unavailable');
  };
  controller.action({ type: 'confirm' });
  await flush();
  assert.equal(chooser.destroyed, false);
  assert.equal(latest(chooser).error, 'Target unavailable');
  provider.preview = preview;
  controller.action({ type: 'confirm' });
  assert.equal((await result).id, 'demo-window-1');
  assert.equal(chooser.destroyed, true);
});
