const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createScreenshotStore } = require('../electron/screenshot/screenshot-store.cjs');
const { registerScreenshotIpc } = require('../electron/screenshot/screenshot-ipc.cjs');
const { historicalAppearance } = require('../electron/projects/composition-appearance.cjs');

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const webpBytes = Buffer.alloc(16);
webpBytes.write('RIFF', 0, 'ascii');
webpBytes.writeUInt32LE(8, 4);
webpBytes.write('WEBP', 8, 'ascii');
webpBytes.write('VP8 ', 12, 'ascii');
const asArrayBuffer = (value) => Uint8Array.from(value).buffer;
const validScreenshotState = (patch = {}) => {
  const state = {
    format: 'png',
    quality: 0.95,
    blurPercent: 30,
    background: null,
    shapes: [],
    image: {
      id: 'screenshot',
      kind: 'image',
      transform: { x: 0.06, y: 0.06, width: 0.88, height: 0.88 },
      appearance: historicalAppearance('screen', true),
    },
    canvas: { width: 1280, height: 720, showBackground: true },
  };
  return {
    ...state,
    ...patch,
    image: patch.image === undefined ? state.image : patch.image,
    canvas: patch.canvas === undefined ? state.canvas : { ...state.canvas, ...patch.canvas },
  };
};
const validShape = (patch = {}) => ({
  kind: 'shape',
  family: 'arrow',
  id: 'shape-1',
  transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.16 },
  enabled: true,
  rotation: 0,
  borderWidth: 0,
  shadowBlur: 32,
  ...patch,
});
const catalog = {
  sources: [{ id: 'display-1', kind: 'display', isDefault: true }],
  capabilities: {
    separateCursor: true,
    cursorClicks: true,
    cursorShapes: true,
    inputShortcuts: true,
    embeddedCursor: true,
  },
};

function makeFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-ipc-'));
  const screenshotRoot = path.join(root, 'screenshots');
  const outputDirectory = path.join(root, 'exports');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const store = createScreenshotStore(screenshotRoot);
  const handlers = new Map();
  const calls = {
    nativeRequests: [],
    presetReads: 0,
    clipboardWrites: [],
    imageBuffers: [],
    dialogs: [],
    openedEditors: [],
    canCapture: 0,
  };
  let dialogResult = options.dialogResult ?? { canceled: false, filePath: path.join(outputDirectory, 'saved.png') };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const captureEngine = {
    request: async (command, payload = {}) => {
      if (typeof command !== 'string') throw new TypeError('CaptureEngine.request requires a command string.');
      const request = { command, payload };
      calls.nativeRequests.push(request);
      if (command === 'discover') {
        if (options.discover) return options.discover(request);
        return catalog;
      }
      if (command === 'screenshot') {
        if (options.onScreenshot) return options.onScreenshot(request);
        return { width: 1280, height: 720 };
      }
      throw new Error('Unexpected native request: ' + command);
    },
  };
  const presetStore = {
    read: () => {
      calls.presetReads += 1;
      if (options.presetRead) return options.presetRead();
      return {
        schemaVersion: 1,
        activePresetId: 'screenshot-default',
        presets: [{ id: 'screenshot-default', settings: { format: 'png', canvas: { width: 1920, height: 1080 } } }],
      };
    },
  };
  const dialog = {
    showSaveDialog: async (...args) => {
      calls.dialogs.push(args);
      if (options.onDialog) return options.onDialog(...args);
      return dialogResult;
    },
  };
  const clipboard = { writeImage: (image) => calls.clipboardWrites.push(image) };
  const nativeImage = {
    createFromBuffer: (buffer) => {
      calls.imageBuffers.push(Buffer.from(buffer));
      return { isEmpty: () => options.emptyNativeImage === true, buffer: Buffer.from(buffer) };
    },
  };
  const BrowserWindow = { fromWebContents: () => ({ owner: 'trusted-window' }) };
  const openEditor = async (id) => {
    calls.openedEditors.push(id);
    return { opened: id };
  };
  const registration = registerScreenshotIpc({
    ipcMain,
    store,
    presetStore,
    captureEngine,
    BrowserWindow,
    dialog,
    clipboard,
    nativeImage,
    openEditor,
    isTrustedRenderer: (url) => url === 'beam://app/index.html',
    canCapture: () => {
      calls.canCapture += 1;
      return options.canCapture !== false;
    },
    outputDirectory,
    platform: options.platform ?? 'win32',
  });
  const event = (url = 'beam://app/index.html') => ({
    sender: { id: 7, getURL: () => url },
  });
  return {
    root,
    screenshotRoot,
    outputDirectory,
    store,
    handlers,
    calls,
    registration,
    trustedEvent: event(),
    invoke: (channel, payload, senderEvent = event()) => {
      const handler = handlers.get(channel);
      assert.ok(handler, 'Missing IPC handler ' + channel);
      return handler(senderEvent, payload);
    },
    setDialogResult: (next) => {
      dialogResult = next;
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function addScreenshot(store) {
  const pending = store.create();
  fs.writeFileSync(pending.path, pngBytes);
  return store.complete(pending.id, { width: 1280, height: 720 }, { format: 'png' });
}

test('rejects untrusted renderer requests before invoking screenshot capabilities', async () => {
  const fixture = makeFixture();
  try {
    await assert.rejects(
      Promise.resolve().then(() =>
        fixture.invoke(
          'screenshot:capture',
          { screenKind: 'display', screenId: 'display-1' },
          {
            sender: { id: 9, getURL: () => 'https://untrusted.example' },
          },
        ),
      ),
      /not authorized/i,
    );
    assert.deepEqual(fixture.calls.nativeRequests, []);
    assert.equal(fixture.calls.canCapture, 0);
  } finally {
    fixture.cleanup();
  }
});

test('rejects unsupported screenshot source kinds before discovery and releases capture state', async () => {
  const fixture = makeFixture();
  try {
    await assert.rejects(
      fixture.invoke('screenshot:capture', { screenKind: 'screenshot', screenId: 'display-1' }),
      /invalid screenshot source/i,
    );
    assert.deepEqual(fixture.calls.nativeRequests, []);
    assert.equal(fixture.registration.isBusy(), false);
    assert.equal(fixture.store.list().length, 0);
  } finally {
    fixture.cleanup();
  }
});

test('captures through the native screenshot command without cursor or audio tracks', async () => {
  const fixture = makeFixture();
  try {
    const result = await fixture.invoke('screenshot:capture', {
      screenKind: 'display',
      screenId: 'display-1',
      region: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
      excludedWindowHandles: ['abc123'],
    });

    assert.deepEqual(
      fixture.calls.nativeRequests.map((request) => request.command),
      ['discover', 'screenshot'],
    );
    assert.ok(fixture.calls.nativeRequests.every((request) => typeof request.command === 'string'));
    const screenshotRequest = fixture.calls.nativeRequests[1];
    assert.deepEqual(screenshotRequest.payload, {
      config: {
        screen: { mode: 'source', sourceId: 'display-1' },
        region: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
        output: path.join(fixture.screenshotRoot, result.id, 'source.png'),
        excludedWindowHandles: ['abc123'],
      },
    });
    assert.equal('cursor' in screenshotRequest.payload.config, false);
    assert.equal('systemAudio' in screenshotRequest.payload.config, false);
    assert.equal(fixture.calls.presetReads, 1);
    assert.equal(result.width, 1280);
    assert.equal(fixture.store.list().length, 1);
  } finally {
    fixture.cleanup();
  }
});

test('serializes capture requests and releases the lock after completion', async () => {
  let releaseScreenshot;
  const screenshotResult = new Promise((resolve) => {
    releaseScreenshot = resolve;
  });
  const fixture = makeFixture({ onScreenshot: () => screenshotResult });
  try {
    const first = fixture.invoke('screenshot:capture', { screenKind: 'display', screenId: 'display-1' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.registration.isBusy(), true);
    assert.equal(fixture.calls.nativeRequests.length, 2);

    await assert.rejects(
      fixture.invoke('screenshot:capture', { screenKind: 'display', screenId: 'display-1' }),
      /another capture is already active/i,
    );
    assert.equal(fixture.calls.nativeRequests.length, 2);

    releaseScreenshot({ width: 1280, height: 720 });
    await first;
    assert.equal(fixture.registration.isBusy(), false);
  } finally {
    releaseScreenshot?.({ width: 1280, height: 720 });
    fixture.cleanup();
  }
});

test('removes a pending screenshot and releases the lock when native capture fails', async () => {
  const fixture = makeFixture({
    onScreenshot: async () => {
      throw new Error('native screenshot failed');
    },
  });
  try {
    await assert.rejects(
      fixture.invoke('screenshot:capture', { screenKind: 'display', screenId: 'display-1' }),
      /native screenshot failed/,
    );
    assert.equal(fixture.store.list().length, 0);
    assert.equal(fixture.registration.isBusy(), false);
  } finally {
    fixture.cleanup();
  }
});

for (const code of ['portal-cancelled', 'cancelled']) {
  test(`treats native ${code} screenshot cancellation as dismissal and permits retry`, async () => {
    let cancelNext = true;
    const fixture = makeFixture({
      onScreenshot: async () => {
        if (cancelNext) {
          cancelNext = false;
          const error = new Error(`native screenshot ${code}`);
          error.code = code;
          throw error;
        }
        return { width: 1280, height: 720 };
      },
    });
    try {
      const options = { screenKind: 'display', screenId: 'display-1' };
      assert.equal(await fixture.invoke('screenshot:capture', options), null);

      const firstCapture = fixture.calls.nativeRequests.find((request) => request.command === 'screenshot');
      assert.ok(firstCapture);
      assert.equal(fs.existsSync(path.dirname(firstCapture.payload.config.output)), false);
      assert.equal(fixture.store.list().length, 0);
      assert.equal(fixture.registration.isBusy(), false);

      const retried = await fixture.invoke('screenshot:capture', options);
      assert.ok(retried.id);
      assert.equal(retried.width, 1280);
      assert.equal(fixture.store.list().length, 1);
      assert.equal(fixture.registration.isBusy(), false);
      assert.deepEqual(
        fixture.calls.nativeRequests.map((request) => request.command),
        ['discover', 'screenshot', 'discover', 'screenshot'],
      );
    } finally {
      fixture.cleanup();
    }
  });
}

test('does not treat cancellation-like screenshot error text as a canceled capture', async () => {
  let cancelNext = true;
  const fixture = makeFixture({
    onScreenshot: async () => {
      if (cancelNext) {
        cancelNext = false;
        throw new Error('Portal cancellation was denied by the native capture service.');
      }
      return { width: 1280, height: 720 };
    },
  });
  try {
    const options = { screenKind: 'display', screenId: 'display-1' };
    await assert.rejects(
      fixture.invoke('screenshot:capture', options),
      /Portal cancellation was denied by the native capture service/,
    );

    const failedCapture = fixture.calls.nativeRequests.find((request) => request.command === 'screenshot');
    assert.ok(failedCapture);
    assert.equal(fs.existsSync(path.dirname(failedCapture.payload.config.output)), false);
    assert.equal(fixture.store.list().length, 0);
    assert.equal(fixture.registration.isBusy(), false);

    const retried = await fixture.invoke('screenshot:capture', options);
    assert.ok(retried.id);
    assert.equal(fixture.store.list().length, 1);
    assert.equal(fixture.registration.isBusy(), false);
  } finally {
    fixture.cleanup();
  }
});

test('removes a captured screenshot and releases the lock when preset lookup fails', async () => {
  const fixture = makeFixture({
    presetRead: () => {
      throw new Error('screenshot preset unavailable');
    },
  });
  try {
    await assert.rejects(
      fixture.invoke('screenshot:capture', { screenKind: 'display', screenId: 'display-1' }),
      /screenshot preset unavailable/,
    );
    assert.deepEqual(
      fixture.calls.nativeRequests.map((request) => request.command),
      ['discover', 'screenshot'],
    );
    assert.equal(fixture.store.list().length, 0);
    assert.equal(fixture.registration.isBusy(), false);
  } finally {
    fixture.cleanup();
  }
});

test('saves screenshot editor state and opens only an existing screenshot', async () => {
  const fixture = makeFixture();
  try {
    const screenshot = addScreenshot(fixture.store);
    const state = validScreenshotState({
      format: 'webp',
      canvas: { width: 1600, height: 900 },
    });
    state.image.enabled = true;
    const redoState = validScreenshotState({ quality: 0.8 });
    redoState.image.enabled = true;
    const history = {
      version: 1,
      undo: [JSON.parse(JSON.stringify(state))],
      redo: [redoState],
    };
    await fixture.invoke('screenshot:save', { id: screenshot.id, state, history });
    assert.deepEqual(fixture.store.read(screenshot.id).state, state);
    assert.deepEqual(fixture.store.read(screenshot.id).history, history);
    assert.deepEqual(await fixture.invoke('screenshot:get', screenshot.id), fixture.store.read(screenshot.id));
    assert.equal((await fixture.invoke('screenshot:list')).length, 1);

    assert.deepEqual(await fixture.invoke('screenshot:open', screenshot.id), { opened: screenshot.id });
    assert.deepEqual(fixture.calls.openedEditors, [screenshot.id]);
    await assert.rejects(
      Promise.resolve().then(() => fixture.invoke('screenshot:open', '11111111-1111-4111-8111-111111111111')),
    );
    assert.deepEqual(fixture.calls.openedEditors, [screenshot.id]);
  } finally {
    fixture.cleanup();
  }
});

test('validates PNG and WebP encodings for clipboard publication and file saving', async () => {
  const fixture = makeFixture();
  try {
    const screenshot = addScreenshot(fixture.store);
    const png = asArrayBuffer(pngBytes);
    const webp = asArrayBuffer(webpBytes);

    assert.equal(
      await fixture.invoke('screenshot:export', { id: screenshot.id, bytes: png, format: 'png', copy: true }),
      null,
    );
    assert.deepEqual(fixture.calls.imageBuffers[0], pngBytes);
    assert.equal(fixture.calls.clipboardWrites.length, 1);

    await assert.rejects(
      fixture.invoke('screenshot:export', { id: screenshot.id, bytes: webp, format: 'webp', copy: true }),
      /clipboard images must be encoded as png/i,
    );
    assert.equal(fixture.calls.imageBuffers.length, 1);
    assert.equal(fixture.calls.clipboardWrites.length, 1);
    assert.equal(fixture.calls.dialogs.length, 0);

    await assert.rejects(
      fixture.invoke('screenshot:export', { id: screenshot.id, bytes: webp, format: 'png', copy: true }),
      /encoding does not match/i,
    );
    await assert.rejects(
      fixture.invoke('screenshot:export', { id: screenshot.id, bytes: png, format: 'webp', copy: true }),
      /encoding does not match/i,
    );
    await assert.rejects(
      fixture.invoke('screenshot:export', {
        id: screenshot.id,
        bytes: new Uint8Array(pngBytes),
        format: 'png',
        copy: true,
      }),
      /invalid screenshot export/i,
    );
    assert.equal(fixture.calls.clipboardWrites.length, 1);

    const outputFile = path.join(fixture.outputDirectory, 'final.png');
    fixture.setDialogResult({ canceled: false, filePath: outputFile });
    assert.equal(
      await fixture.invoke('screenshot:export', { id: screenshot.id, bytes: png, format: 'png', copy: false }),
      outputFile,
    );
    assert.deepEqual(fs.readFileSync(outputFile), pngBytes);
    assert.equal(fixture.calls.dialogs.length, 1);
    assert.equal(fixture.calls.dialogs[0][0].owner, 'trusted-window');
    assert.deepEqual(fixture.calls.dialogs[0][1].filters, [{ name: 'PNG', extensions: ['png'] }]);

    const outputWebpFile = path.join(fixture.outputDirectory, 'final.webp');
    fixture.setDialogResult({ canceled: false, filePath: outputWebpFile });
    assert.equal(
      await fixture.invoke('screenshot:export', { id: screenshot.id, bytes: webp, format: 'webp', copy: false }),
      outputWebpFile,
    );
    assert.deepEqual(fs.readFileSync(outputWebpFile), webpBytes);
    assert.equal(fixture.calls.imageBuffers.length, 2);

    const canceledFile = path.join(fixture.outputDirectory, 'canceled.webp');
    fixture.setDialogResult({ canceled: true, filePath: undefined });
    assert.equal(
      await fixture.invoke('screenshot:export', { id: screenshot.id, bytes: webp, format: 'webp', copy: false }),
      null,
    );
    assert.equal(fs.existsSync(canceledFile), false);
    assert.equal(fixture.calls.dialogs.length, 3);
    assert.equal(fixture.calls.dialogs[2][1].filters[0].extensions[0], 'webp');
  } finally {
    fixture.cleanup();
  }
});

for (const [screenKind, screenId] of [
  ['display', 'portal:monitor'],
  ['window', 'portal:window'],
]) {
  test(`Linux ${screenKind} screenshots open the Portal without video/audio discovery`, async () => {
    const f = makeFixture({
      platform: 'linux',
      discover: () => {
        throw new Error('must not discover');
      },
    });
    try {
      await f.invoke('screenshot:capture', { screenKind, screenId });
      assert.deepEqual(
        f.calls.nativeRequests.map((item) => item.command),
        ['screenshot'],
      );
    } finally {
      f.cleanup();
    }
  });
}
