const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHtmlRenderer } = require('../apps/desktop/electron/authoring/html-renderer.cjs');

function setup(t, options = {}) {
  const windows = [],
    policy = {};
  class Window {
    constructor(settings) {
      this.settings = settings;
      this.dead = false;
      this.webContents = new EventEmitter();
      windows.push(this);
      this.webContents.setAudioMuted = (value) => {
        this.muted = value;
      };
      this.webContents.setZoomMode = (mode) => {
        this.zoomMode = mode;
      };
      this.webContents.setZoomFactor = (factor) => {
        this.zoomFactor = factor;
      };
      this.webContents.setWindowOpenHandler = (callback) => {
        this.popup = callback;
      };
      this.webContents.executeJavaScript = async (code) => {
        this.code = code;
        if (options.script) return options.script(this);
      };
      this.webContents.capturePage = async (...args) => {
        this.captureArgs = args;
        return {
          isEmpty: () => options.empty === true,
          getSize: () => ({ width: options.width ?? 64, height: 64 }),
          resize: (size) => {
            this.resized = size;
            return { toPNG: () => Buffer.from('resized') };
          },
          toPNG: () => Buffer.from('pixels'),
        };
      };
    }
    loadURL(url) {
      this.url = url;
      return options.load?.(this) ?? Promise.resolve();
    }
    isDestroyed() {
      return this.dead;
    }
    destroy() {
      this.dead = true;
    }
  }
  const renderer = createHtmlRenderer({
    BrowserWindow: Window,
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: (callback) => {
          policy.permission = callback;
        },
        setPermissionCheckHandler: (callback) => {
          policy.check = callback;
        },
        webRequest: {
          onBeforeRequest: (callback) => {
            policy.request = callback;
          },
        },
      }),
    },
    files: {
      fileFor: (_context, _html, name) => {
        if (name.includes('..')) throw new Error('Unsafe');
        return `/bundle/${name}`;
      },
    },
    origin: () => 'http://127.0.0.1:1234',
  });
  t.after(() => renderer.dispose());
  const html = {
    version: 1,
    id: 'html',
    revision: 'revision',
    entry: 'index.html',
    width: 64,
    height: 64,
    durationMs: 1000,
    fps: 30,
    framework: 'html',
  };
  return { renderer, windows, policy, html, context: { projectId: 'project', kind: 'video' } };
}
test('HTML native surface remains hidden, sandboxed, permission-free and restricted to its frozen bundle', async (t) => {
  const { renderer, windows, policy, html, context } = setup(t);
  assert.equal((await renderer.capture(context, html, 50)).toString(), 'pixels');
  const window = windows[0];
  assert.equal(window.settings.show, false);
  assert.equal(window.settings.focusable, false);
  assert.equal(window.settings.webPreferences.sandbox, true);
  assert.equal(window.settings.webPreferences.nodeIntegration, false);
  assert.equal(window.settings.webPreferences.preload, undefined);
  assert.equal(window.settings.webPreferences.backgroundThrottling, false);
  assert.equal(window.muted, true);
  assert.equal(window.popup().action, 'deny');
  assert.equal(policy.check(), false);
  policy.permission(null, 'camera', (granted) => assert.equal(granted, false));
  let cancellation;
  policy.request({ url: window.url }, (result) => {
    cancellation = result.cancel;
  });
  assert.equal(cancellation, false);
  policy.request({ url: 'https://example.com' }, (result) => {
    cancellation = result.cancel;
  });
  assert.equal(cancellation, true);
  const token = /\/html\/([^/]+)/.exec(window.url)[1];
  assert.equal(renderer.bundleFile(token, 'index.html'), '/bundle/index.html');
  assert.equal(renderer.bundleFile('unknown', 'index.html'), null);
  assert.deepEqual(window.captureArgs[1], { stayHidden: true, stayAwake: true });
  let prevented = false;
  window.webContents.emit('will-navigate', {
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
});
test('HTML frames are serialized, static clocks stay at zero and source extensions hold the final frame', async (t) => {
  let active = 0,
    maximum = 0;
  const { renderer, windows, context, html } = setup(t, {
    script: async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise((done) => setImmediate(done));
      active--;
    },
  });
  await Promise.all([renderer.capture(context, html, 100), renderer.capture(context, html, 200)]);
  assert.equal(maximum, 1);
  assert.equal(windows.length, 1);
  await renderer.capture(context, html, 1500);
  assert.ok(windows[0].code.includes('seek(1000)'));
  await renderer.capture(context, { ...html, revision: 'static', durationMs: 0 }, 1000);
  assert.ok(windows[1].code.includes('seek(0)'));
  await assert.rejects(renderer.capture(context, html, -1), /outside/);
  await assert.rejects(renderer.capture(context, html, NaN), /outside/);
});
test('HTML captures normalize device scaling and destroy broken surfaces rather than keeping stale pixels', async (t) => {
  const scaled = setup(t, { width: 128, height: 128 });
  assert.equal((await scaled.renderer.capture(scaled.context, scaled.html, 0)).toString(), 'resized');
  assert.deepEqual(scaled.windows[0].resized, { width: 64, height: 64 });
  const broken = setup(t, { empty: true });
  await assert.rejects(broken.renderer.capture(broken.context, broken.html, 0), /empty/);
  assert.equal(broken.windows[0].dead, true);
  const script = setup(t, {
    script: async () => {
      throw new Error('Shader failed');
    },
  });
  await assert.rejects(script.renderer.capture(script.context, script.html, 0), /Shader failed/);
  assert.equal(script.windows[0].dead, true);
});
test('HTML runtime exceptions, crashed processes and stalled frames fail explicitly', async (t) => {
  const logged = setup(t, {
    load: async (window) => {
      window.webContents.emit('console-message', { level: 'error', message: 'Syntax error' });
    },
  });
  await assert.rejects(logged.renderer.capture(logged.context, logged.html, 0), /Syntax error/);
  const crash = setup(t, {
    load: async (window) => {
      window.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    },
  });
  await assert.rejects(crash.renderer.capture(crash.context, crash.html, 0), /crashed/);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = setup(t, { script: () => new Promise(() => {}) });
  const pending = stalled.renderer.capture(stalled.context, stalled.html, 0);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(20000);
  await assert.rejects(pending, /timed out/);
  assert.equal(stalled.windows[0].dead, true);
});
test('HTML surfaces are bounded and disposal removes capabilities and rejects future renders', async (t) => {
  const { renderer, windows, context, html } = setup(t);
  for (let i = 0; i < 6; i++) await renderer.capture(context, { ...html, revision: String(i) }, 0);
  assert.equal(windows.filter((window) => !window.dead).length, 4);
  assert.equal(windows[0].dead, true);
  const token = /\/html\/([^/]+)/.exec(windows[5].url)[1];
  renderer.dispose();
  assert.ok(windows.every((window) => window.dead));
  assert.equal(renderer.bundleFile(token, 'index.html'), null);
  await assert.rejects(renderer.capture(context, html, 0), /stopped/);
});

test('HTML thumbnails retain full logical layout while rasterizing at an isolated small zoom', async (t) => {
  const f = setup(t),
    html = { ...f.html, width: 1920, height: 1080 };
  await f.renderer.capture(f.context, html, 100, 240);
  const small = f.windows[0];
  assert.equal(small.settings.width, 480);
  assert.equal(small.settings.height, 270);
  assert.equal(small.zoomMode, 'isolated');
  assert.equal(small.zoomFactor, 0.25);
  assert.deepEqual(small.captureArgs[0], { x: 0, y: 0, width: 480, height: 270 });
  await f.renderer.capture(f.context, html, 200, 480);
  assert.equal(f.windows.length, 1);
  await f.renderer.capture(f.context, html, 100);
  assert.equal(f.windows.length, 2);
  assert.equal(f.windows[1].settings.width, 1920);
  assert.equal(f.windows[1].zoomFactor, 1);
});
test('HTML thumbnail resolution upgrades get their own bounded source and reject arbitrary widths', async (t) => {
  const f = setup(t),
    html = { ...f.html, width: 1920, height: 1080 };
  await f.renderer.capture(f.context, html, 0, 960);
  assert.equal(f.windows[0].settings.width, 960);
  assert.equal(f.windows[0].settings.height, 540);
  assert.equal(f.windows[0].zoomFactor, 0.5);
  for (const width of [0, NaN, -1, 241, 8192])
    await assert.rejects(f.renderer.capture(f.context, html, 0, width), /thumbnail width/);
  assert.equal(f.windows.length, 1);
});
