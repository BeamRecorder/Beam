const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDefaultCaptureConfig } = require('../electron/capture/capture-config.cjs');

const catalog = {
  capabilities: {
    systemAudio: true,
    separateCursor: true,
    cursorClicks: true,
    cursorShapes: false,
  },
  sources: [
    { id: 'display:2', kind: 'display', isDefault: false },
    { id: 'display:1', kind: 'display', isDefault: true },
    { id: 'window:1', kind: 'window', isDefault: false },
    { id: 'wgc:window:7b', kind: 'window', isDefault: false },
    { id: 'sck:window:123', kind: 'window', isDefault: false },
  ],
};

const environment = { platform: 'win32', defaultOutputRoot: 'recordings', excludedProcessId: 4242 };

test('builds a one-call recording config from defaults', () => {
  const config = buildDefaultCaptureConfig(catalog, {}, environment);

  assert.equal(config.screen.sourceId, 'display:1');
  assert.equal('microphone' in config, false);
  assert.equal('systemAudio' in config, false);
  assert.deepEqual(config.cursor, {
    mode: 'separate',
    captureClicks: true,
    captureShape: false,
  });
  assert.equal(config.recording.outputRoot, 'recordings');
  assert.equal(config.excludedProcessId, 4242);
});

test('supports explicit source selection and disabling optional devices', () => {
  const config = buildDefaultCaptureConfig(
    catalog,
    {
      screenKind: 'window',
      screenId: 'window:1',
    },
    environment,
  );
  assert.equal(config.screen.sourceId, 'window:1');
});

test('normalizes an Electron Windows window id to the Rust WGC source id', () => {
  const config = buildDefaultCaptureConfig(
    catalog,
    {
      screenKind: 'window',
      screenId: 'window:123:0',
    },
    environment,
  );
  assert.equal(config.screen.sourceId, 'wgc:window:7b');
});

test('normalizes an Electron macOS window id to the ScreenCaptureKit source id', () => {
  const config = buildDefaultCaptureConfig(
    catalog,
    {
      screenKind: 'window',
      screenId: 'window:123:0',
    },
    { ...environment, platform: 'darwin' },
  );
  assert.equal(config.screen.sourceId, 'sck:window:123');
});

test('rejects missing explicit sources and invalid queue capacity', () => {
  assert.throws(
    () => buildDefaultCaptureConfig(catalog, { screenId: 'missing' }, environment),
    /Source display introuvable/,
  );
  assert.throws(() => buildDefaultCaptureConfig(catalog, { queueCapacity: 0 }, environment), /queueCapacity/);
});

test('builds a Linux monitor Portal selection without a Chromium source id', () => {
  const config = buildDefaultCaptureConfig(
    {
      capabilities: { portalSelection: true, separateCursor: true },
      sources: [
        {
          id: 'portal:monitor',
          kind: 'display',
          isDefault: true,
          selectionMode: 'portal',
        },
      ],
    },
    {},
    { ...environment, platform: 'linux' },
  );
  assert.deepEqual(config.screen, {
    mode: 'portal',
    kind: 'monitor',
    restoreToken: null,
  });
  assert.deepEqual(config.cursor, {
    mode: 'separate',
    captureClicks: false,
    captureShape: false,
  });
});

test('builds a Linux window Portal selection and rejects region capture', () => {
  const portalCatalog = {
    capabilities: { portalSelection: true },
    sources: [
      {
        id: 'portal:window',
        kind: 'window',
        isDefault: true,
        selectionMode: 'portal',
      },
    ],
  };
  const linux = { ...environment, platform: 'linux' };
  assert.equal(buildDefaultCaptureConfig(portalCatalog, { screenKind: 'window' }, linux).screen.kind, 'window');
  assert.throws(
    () =>
      buildDefaultCaptureConfig(
        portalCatalog,
        { screenKind: 'window', region: { x: 0, y: 0, width: 1, height: 1 } },
        linux,
      ),
    /picker système Linux/,
  );
});

test('keeps Linux Portal intents when a second discovery is empty', () => {
  const linux = { ...environment, platform: 'linux' };
  const firstCatalog = {
    capabilities: { portalSelection: true },
    sources: [
      { id: 'portal:monitor', kind: 'display', isDefault: true, selectionMode: 'portal' },
      { id: 'portal:window', kind: 'window', isDefault: true, selectionMode: 'portal' },
    ],
  };
  const emptySecondCatalog = { capabilities: {}, sources: [] };

  for (const [screenKind, screenId, expectedKind] of [
    [undefined, 'portal:monitor', 'monitor'],
    ['window', 'portal:window', 'window'],
  ]) {
    const options = { screenId, ...(screenKind ? { screenKind } : {}) };
    assert.equal(buildDefaultCaptureConfig(firstCatalog, options, linux).screen.kind, expectedKind);
    assert.deepEqual(buildDefaultCaptureConfig(emptySecondCatalog, options, linux).screen, {
      mode: 'portal',
      kind: expectedKind,
      restoreToken: null,
    });
  }
});
