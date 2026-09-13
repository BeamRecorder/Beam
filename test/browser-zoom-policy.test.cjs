const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  DEFAULT_ZOOM_FACTOR,
  enforceDefaultZoom,
  installBrowserZoomPolicy,
  isBrowserZoomShortcut,
} = require('../electron/window/browser-zoom-policy.cjs');

function createWebContents({ destroyed = false } = {}) {
  const webContents = new EventEmitter();
  const calls = [];

  webContents.isDestroyed = () => destroyed;
  webContents.setZoomLevel = (level) => calls.push(['setZoomLevel', level]);
  webContents.setZoomFactor = (factor) => calls.push(['setZoomFactor', factor]);

  return { webContents, calls };
}

function waitForImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('enforceDefaultZoom resets both Chromium zoom representations', () => {
  const { webContents, calls } = createWebContents();

  enforceDefaultZoom(webContents);

  assert.deepEqual(calls, [
    ['setZoomLevel', 0],
    ['setZoomFactor', DEFAULT_ZOOM_FACTOR],
  ]);
});

test('installBrowserZoomPolicy resets zoom after loading', () => {
  const { webContents, calls } = createWebContents();

  const cleanup = installBrowserZoomPolicy(webContents);

  assert.deepEqual(calls, []);

  webContents.emit('did-finish-load');

  assert.deepEqual(calls, [
    ['setZoomLevel', 0],
    ['setZoomFactor', DEFAULT_ZOOM_FACTOR],
  ]);

  cleanup();
});

test('installBrowserZoomPolicy prevents a zoom request and restores the default after it', async () => {
  const { webContents, calls } = createWebContents();
  let prevented = false;

  const cleanup = installBrowserZoomPolicy(webContents);
  const initialCallCount = calls.length;

  webContents.emit('zoom-changed', {
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  await waitForImmediate();

  assert.ok(calls.length >= initialCallCount + 2);
  assert.deepEqual(calls.slice(-2), [
    ['setZoomLevel', 0],
    ['setZoomFactor', DEFAULT_ZOOM_FACTOR],
  ]);

  cleanup();
});

test('browser zoom keyboard shortcuts are blocked without consuming application shortcuts', () => {
  const { webContents } = createWebContents();
  const cleanup = installBrowserZoomPolicy(webContents);

  for (const input of [
    { type: 'keyDown', control: true, key: '+' },
    { type: 'keyDown', control: true, key: '-' },
    { type: 'keyDown', meta: true, key: '0' },
  ]) {
    let prevented = false;
    webContents.emit('before-input-event', { preventDefault: () => (prevented = true) }, input);
    assert.equal(prevented, true);
    assert.equal(isBrowserZoomShortcut(input), true);
  }

  let prevented = false;
  webContents.emit(
    'before-input-event',
    { preventDefault: () => (prevented = true) },
    { type: 'keyDown', control: true, key: 'a' },
  );
  assert.equal(prevented, false);
  cleanup();
});

test('cleanup removes zoom policy listeners', () => {
  const { webContents, calls } = createWebContents();
  const cleanup = installBrowserZoomPolicy(webContents);
  const initialCallCount = calls.length;

  cleanup();

  assert.equal(webContents.listenerCount('zoom-changed'), 0);
  assert.equal(webContents.listenerCount('before-input-event'), 0);
  assert.equal(webContents.listenerCount('did-finish-load'), 0);

  webContents.emit('did-finish-load');
  webContents.emit('zoom-changed', { preventDefault() {} });

  assert.equal(calls.length, initialCallCount);
});

test('resetOnLoad can be disabled for windows that wait for ready-to-show', () => {
  const { webContents, calls } = createWebContents();
  const cleanup = installBrowserZoomPolicy(webContents, { resetOnLoad: false });

  webContents.emit('did-finish-load');

  assert.deepEqual(calls, []);
  assert.equal(webContents.listenerCount('did-finish-load'), 0);
  cleanup();
});

test('enforceDefaultZoom is a no-op for destroyed webContents', () => {
  const { webContents, calls } = createWebContents({ destroyed: true });

  enforceDefaultZoom(webContents);

  assert.deepEqual(calls, []);
});

test('installBrowserZoomPolicy does not touch destroyed webContents', () => {
  const { webContents, calls } = createWebContents({ destroyed: true });

  const cleanup = installBrowserZoomPolicy(webContents);
  webContents.emit('did-finish-load');
  webContents.emit('zoom-changed', { preventDefault() {} });

  assert.deepEqual(calls, []);
  cleanup();
});
