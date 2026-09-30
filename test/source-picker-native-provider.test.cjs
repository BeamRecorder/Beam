const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createNativeSourceProvider,
  sourceDescription,
  windowSourceId,
  validBounds,
} = require('../electron/source-picker/native-source-provider.cjs');

test('canonicalizes Electron handles without reinterpreting native hexadecimal IDs', () => {
  assert.equal(windowSourceId('window:42:0', 'win32'), 'wgc:window:2a');
  assert.equal(windowSourceId('window:42:0', 'darwin'), 'sck:window:42');
  assert.equal(windowSourceId('wgc:window:1000', 'win32'), 'wgc:window:1000');
});
test('source metadata preserves names and dimensions with and without application labels', () => {
  assert.deepEqual(sourceDescription('id', 'window', 'Title — Editor', { width: 1280, height: 720 }).app, 'Editor');
  assert.equal(sourceDescription('id', 'window', 'Untitled').name, 'Untitled');
  assert.equal(sourceDescription('id', 'screen', 'Monitor', { width: 0, height: 0 }).aspect, 16 / 9);
});
test('bounds validation preserves negative origins and rejects missing or invalid rectangles', () => {
  assert.deepEqual(validBounds({ x: -100.2, y: 0, width: 1024, height: 720 }), {
    x: -100,
    y: 0,
    width: 1024,
    height: 720,
  });
  for (const value of [null, {}, { x: 0, y: 0, width: 0, height: 5 }, { x: 0, y: NaN, width: 10, height: 5 }])
    assert.throws(() => validBounds(value), /invalid/);
});

function fixture(platform = 'win32') {
  const calls = [];
  const display = { id: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 } };
  const windows = [
    { id: 'screen:1:0', name: 'Display', display_id: '1' },
    { id: 'window:42:0', name: 'Editor' },
    { id: 'window:43:0', name: 'Beam Recorder' },
    { id: 'window:48:0', name: 'My project - Beam Editor' },
  ].map((source) => ({
    ...source,
    thumbnail: { toDataURL: () => `data:image/jpeg;base64,${source.id}` },
    appIcon: null,
  }));
  const catalog = {
    sources: [
      {
        id: 'wgc:window:2a',
        kind: 'window',
        label: 'Editor',
        capabilities: { formats: [{ width: 1200, height: 800 }] },
      },
      {
        id: 'sck:window:42',
        kind: 'window',
        label: 'Title — Editor',
        capabilities: { formats: [{ width: 1200, height: 800 }] },
      },
      {
        id: 'sck:display:1',
        kind: 'display',
        label: 'Display',
        displayId: '1',
        capabilities: { formats: [{ width: 1920, height: 1080 }] },
      },
    ],
  };
  const requestNative = async (command, payload) => {
    calls.push([command, payload]);
    if (command === 'discover') return catalog;
    if (command === 'resolve-display') return 'wgc:monitor:DISPLAY1';
    if (command === 'window-selection-preview')
      return {
        bounds: { x: -1200, y: 30, width: 1200, height: 800 },
        raiseError: payload.raise ? 'Permission to raise required' : null,
      };
    throw new Error(`Unexpected command ${command}`);
  };
  const ownWindow = (id, url) => ({
    isDestroyed: () => false,
    getMediaSourceId: () => id,
    webContents: { getURL: () => url },
  });
  const desktopCapturer = { getSources: async () => windows };
  const screen = {
    getAllDisplays: () => [display],
    dipToScreenPoint: (point) => ({ x: point.x * 2, y: point.y * 2 }),
    screenToDipRect: (_window, bounds) => ({ ...bounds, width: bounds.width / 2, height: bounds.height / 2 }),
  };
  const getNativePreview = async ({ sourceId }) => ({ thumbnail: `native:${sourceId}` });
  const BrowserWindow = {
    getAllWindows: () => [
      ownWindow('window:43:0', 'http://localhost:6500/'),
      ownWindow('window:48:0', 'http://localhost:6500/editor.html'),
    ],
  };
  const provider = createNativeSourceProvider({
    platform,
    screen,
    desktopCapturer,
    BrowserWindow,
    requestNative,
    getNativePreview,
  });
  return { provider, calls, catalog, desktopCapturer, windows };
}

test('Windows resolves each display in physical coordinates and excludes HUD while keeping editors', async () => {
  const { provider, calls } = fixture();
  const sources = await provider.list();
  assert.ok(sources.some((source) => source.id === 'wgc:monitor:DISPLAY1'));
  assert.ok(sources.some((source) => source.id === 'wgc:window:30'));
  assert.ok(!sources.some((source) => source.id === 'wgc:window:2b'));
  assert.deepEqual(calls.find(([command]) => command === 'resolve-display')[1], { x: -1920, y: 1080 });
  const target = await provider.preview(
    sources.find((source) => source.id === 'wgc:window:2a'),
    true,
  );
  assert.equal(target.bounds.width, 600);
  assert.equal(target.warning, 'Permission to raise required');
  assert.ok(target.thumbnail.includes('window:42:0'));
});
test('macOS lists native capture IDs and refreshes only the hovered window preview', async () => {
  const { provider, catalog, calls } = fixture('darwin');
  catalog.sources = catalog.sources.filter((source) => source.id.startsWith('sck:'));
  const sources = await provider.list();
  assert.equal(sources.length, 2);
  assert.equal(sources[0].thumbnail, 'native:sck:window:42');
  const target = await provider.preview(sources[0], false);
  assert.equal(target.bounds.width, 1200);
  assert.equal(target.warning, null);
  assert.equal(target.thumbnail, 'native:sck:window:42');
  assert.equal(calls.at(-1)[1].raise, false);
});
test('Linux source enumeration cannot invoke Chromium or native custom window selection', async () => {
  const { provider, calls } = fixture('linux');
  await assert.rejects(provider.list(), /Portal/);
  assert.equal(calls.length, 0);
});
test('missing display bounds and invalid native window bounds fail explicitly', async () => {
  const { provider } = fixture();
  await assert.rejects(provider.preview({ id: 'missing', kind: 'screen' }, false), /no longer available/);
  const native = createNativeSourceProvider({
    platform: 'win32',
    requestNative: async () => ({ bounds: { x: 0, y: 0, width: 0, height: 1 } }),
  });
  await assert.rejects(native.preview({ id: 'wgc:window:2a', kind: 'window' }, true), /invalid bounds/);
});

test('macOS never admits Chromium-only privacy indicators or application entries into the picker', async () => {
  const { provider, catalog, desktopCapturer, windows } = fixture('darwin');
  catalog.sources = catalog.sources.filter((source) => source.id.startsWith('sck:'));
  catalog.sources.push({
    id: 'sck:application:100:com.apple.controlcenter',
    kind: 'application',
    label: 'Control Center',
  });
  windows.push({ id: 'window:999:0', name: 'Microphone indicator — Control Center' });
  desktopCapturer.getSources = async () => {
    throw new Error('macOS must use the filtered Rust catalogue');
  };
  const sources = await provider.list();
  assert.deepEqual(
    sources.map((source) => source.id),
    ['sck:window:42', 'sck:display:1'],
  );
});
