const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDefaultCaptureConfig } = require('../electron/capture/capture-config.cjs');

const catalog = {
  capabilities: {
    systemAudio: true,
    separateCursor: true,
    cursorClicks: true,
    inputShortcuts: true,
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

  assert.equal(config.screen.selection.sourceId, 'display:1');
  assert.deepEqual(config.microphone, { mode: 'disabled' });
  assert.deepEqual(config.systemAudio, { mode: 'disabled' });
  assert.deepEqual(config.screen.cursor, {
    mode: 'separate',
    captureClicks: false,
    captureShortcuts: false,
    captureShape: false,
  });
  assert.equal(config.output, 'studio');
  assert.equal(config.outputDir, undefined);
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
  assert.equal(config.screen.selection.sourceId, 'window:1');
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
  assert.equal(config.screen.selection.sourceId, 'wgc:window:7b');
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
  assert.equal(config.screen.selection.sourceId, 'sck:window:123');
});

test('rejects missing explicit sources and invalid frame rate', () => {
  assert.throws(
    () => buildDefaultCaptureConfig(catalog, { screenId: 'missing' }, environment),
    /Source display introuvable/,
  );
  assert.throws(() => buildDefaultCaptureConfig(catalog, { targetFps: 0 }, environment), /targetFps/);
});

test('builds a Linux monitor Portal selection without a Chromium source id', () => {
  const config = buildDefaultCaptureConfig(
    {
      capabilities: { portalSelection: true, separateCursor: true, cursorShapes: true },
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
  assert.deepEqual(config.screen.selection, {
    mode: 'portal',
    kind: 'monitor',
    restoreToken: null,
  });
  assert.deepEqual(config.screen.cursor, {
    mode: 'separate',
    captureClicks: false,
    captureShortcuts: false,
    captureShape: true,
  });
});

test('maps Linux system audio to the native default output only when requested', () => {
  const linux = { ...environment, platform: 'linux' };
  const linuxCatalog = {
    capabilities: { portalSelection: true },
    sources: [{ id: 'portal:monitor', kind: 'display', isDefault: true, selectionMode: 'portal' }],
  };

  assert.deepEqual(buildDefaultCaptureConfig(linuxCatalog, { systemAudio: true }, linux).systemAudio, {
    mode: 'default',
  });
  assert.deepEqual(buildDefaultCaptureConfig(linuxCatalog, { systemAudio: false }, linux).systemAudio, {
    mode: 'disabled',
  });

  for (const platform of ['win32', 'darwin']) {
    assert.deepEqual(
      buildDefaultCaptureConfig(catalog, { systemAudio: true }, { ...environment, platform }).systemAudio,
      { mode: 'default' },
    );
  }
});

test('disables interaction capture consistently on Windows and macOS', () => {
  for (const platform of ['win32', 'darwin']) {
    const config = buildDefaultCaptureConfig(catalog, { recordInteractions: false }, { ...environment, platform });

    assert.deepEqual(config.screen.cursor, {
      mode: 'separate',
      captureClicks: false,
      captureShortcuts: false,
      captureShape: false,
    });
  }
});

test('enables clicks and shortcuts on Linux only when interaction recording is on', () => {
  const linux = { ...environment, platform: 'linux' };
  const linuxCatalog = {
    capabilities: {
      portalSelection: true,
      separateCursor: true,
      cursorClicks: true,
      cursorShapes: true,
      inputShortcuts: true,
    },
    sources: [{ id: 'portal:monitor', kind: 'display', isDefault: true, selectionMode: 'portal' }],
  };

  const disabled = buildDefaultCaptureConfig(linuxCatalog, { recordInteractions: false }, linux);
  assert.deepEqual(disabled.screen.cursor, {
    mode: 'separate',
    captureClicks: false,
    captureShortcuts: false,
    captureShape: true,
  });

  const enabled = buildDefaultCaptureConfig(linuxCatalog, { recordInteractions: true }, linux);
  assert.deepEqual(enabled.screen.cursor, {
    mode: 'separate',
    captureClicks: true,
    captureShortcuts: true,
    captureShape: true,
  });
});

test('normalizes regions relative to Linux Portal monitor and window sources', () => {
  const portalCatalog = {
    capabilities: { portalSelection: true },
    sources: [
      {
        id: 'portal:monitor',
        kind: 'display',
        isDefault: true,
        selectionMode: 'portal',
      },
      {
        id: 'portal:window',
        kind: 'window',
        isDefault: true,
        selectionMode: 'portal',
      },
    ],
  };
  const linux = { ...environment, platform: 'linux' };
  const region = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
  const monitor = buildDefaultCaptureConfig(portalCatalog, { screenId: 'portal:monitor', region }, linux);
  assert.deepEqual(monitor.screen.selection, {
    mode: 'portal',
    kind: 'monitor',
    restoreToken: null,
  });
  assert.deepEqual(monitor.screen.region, region);

  assert.equal(
    buildDefaultCaptureConfig(portalCatalog, { screenKind: 'window', screenId: 'portal:window' }, linux).screen
      .selection.kind,
    'window',
  );
  assert.deepEqual(
    buildDefaultCaptureConfig(portalCatalog, { screenKind: 'window', screenId: 'portal:window', region }, linux).screen
      .region,
    region,
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
    assert.equal(buildDefaultCaptureConfig(firstCatalog, options, linux).screen.selection.kind, expectedKind);
    assert.deepEqual(buildDefaultCaptureConfig(emptySecondCatalog, options, linux).screen.selection, {
      mode: 'portal',
      kind: expectedKind,
      restoreToken: null,
    });
  }
});
