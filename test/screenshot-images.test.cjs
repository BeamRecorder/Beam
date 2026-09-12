const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerScreenshotIpc } = require('../electron/screenshot/screenshot-ipc.cjs');
const { createScreenshotStore } = require('../electron/screenshot/screenshot-store.cjs');
const { createProjectMediaHandler } = require('../electron/projects/project-media-protocol.cjs');
const { historicalAppearance } = require('../electron/projects/composition-appearance.cjs');

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-images-'));
  const screenshotRoot = path.join(root, 'screenshots');
  const inputRoot = path.join(root, 'input');
  const outputRoot = path.join(root, 'exports');
  fs.mkdirSync(inputRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const source = path.join(inputRoot, 'picture.png');
  fs.writeFileSync(source, pngBytes);
  const store = createScreenshotStore(screenshotRoot);
  const pending = store.create();
  fs.writeFileSync(pending.path, pngBytes);
  const document = store.complete(pending.id, { width: 1280, height: 720 }, { format: 'png' });
  return {
    root,
    screenshotRoot,
    inputRoot,
    outputRoot,
    source,
    store,
    document,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function importedLayer(asset, patch = {}) {
  return {
    id: 'image-layer-1',
    kind: 'image',
    name: asset.name,
    assetId: asset.id,
    source: asset.src,
    width: 800,
    height: 600,
    timelineStartMs: 0,
    timelineDurationMs: 1,
    sourceInMs: 0,
    sourceDurationMs: 1,
    playbackRate: 1,
    enabled: true,
    order: 0,
    transform: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    appearance: historicalAppearance('image', true),
    isMirrored: false,
    isMirroredY: false,
    cameraFramingPreset: 'fit',
    ...patch,
  };
}

function screenshotState(images = []) {
  return {
    format: 'png',
    quality: 0.95,
    blurPercent: 30,
    background: null,
    shapes: [],
    images,
    image: {
      id: 'screenshot',
      kind: 'image',
      name: 'Captured screenshot',
      assetId: 'capture-id',
      timelineStartMs: 0,
      timelineDurationMs: 1,
      sourceInMs: 0,
      sourceDurationMs: 1,
      playbackRate: 1,
      enabled: true,
      order: 1,
      transform: { x: 0.06, y: 0.06, width: 0.88, height: 0.88 },
      appearance: historicalAppearance('screen', true),
      isMirrored: false,
      isMirroredY: false,
      cameraFramingPreset: 'fit',
    },
    canvas: { width: 1280, height: 720, showBackground: true },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function registerImageIpc(fx, openDialog) {
  const handlers = new Map();
  const calls = { dialogs: [], owners: [] };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const owner = { id: 'screenshot-window' };
  const BrowserWindow = {
    fromWebContents: (sender) => {
      calls.owners.push(sender);
      return owner;
    },
  };
  const dialog = {
    showOpenDialog: async (...args) => {
      calls.dialogs.push(args);
      return openDialog(...args);
    },
    showSaveDialog: async () => ({ canceled: true }),
  };
  registerScreenshotIpc({
    ipcMain,
    store: fx.store,
    presetStore: { read: () => ({ presets: [], activePresetId: null }) },
    captureEngine: { request: async () => ({}) },
    BrowserWindow,
    dialog,
    clipboard: { writeImage: () => undefined },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) },
    openEditor: async () => undefined,
    isTrustedRenderer: (url) => url === 'beam://app/index.html',
    canCapture: () => true,
    outputDirectory: fx.outputRoot,
  });
  const event = (url = 'beam://app/index.html') => ({
    sender: { id: 7, getURL: () => url },
  });
  return {
    calls,
    owner,
    invoke: (channel, ...args) => {
      const handler = handlers.get(channel);
      assert.ok(handler, `Missing IPC handler ${channel}`);
      return handler(event(), ...args);
    },
    invokeFrom: (channel, url, ...args) => {
      const handler = handlers.get(channel);
      assert.ok(handler, `Missing IPC handler ${channel}`);
      return handler(event(url), ...args);
    },
  };
}

test('imports image media into its screenshot directory and persists scoped references', () => {
  const fx = fixture();
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const expectedUrl = `project-media://screenshot/${fx.document.id}/media/${asset.fileName}`;
    const expectedFile = path.join(fx.screenshotRoot, fx.document.id, 'media', asset.fileName);

    assert.equal(asset.kind, 'image');
    assert.match(asset.id, UUID);
    assert.match(asset.fileName, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i);
    assert.equal(asset.src, expectedUrl);
    assert.equal(fx.store.fileForUrl(asset.src), expectedFile);
    assert.deepEqual(fs.readFileSync(expectedFile), pngBytes);

    const state = screenshotState([importedLayer(asset)]);
    fx.store.save(fx.document.id, state);
    const reopened = fx.store.read(fx.document.id);
    assert.deepEqual(
      reopened.state.images.map(({ id, assetId, source, width, height }) => ({
        id,
        assetId,
        source,
        width,
        height,
      })),
      [{ id: 'image-layer-1', assetId: asset.id, source: expectedUrl, width: 800, height: 600 }],
    );

    fs.rmSync(fx.source);
    assert.deepEqual(fs.readFileSync(fx.store.fileForUrl(reopened.state.images[0].source)), pngBytes);
  } finally {
    fx.cleanup();
  }
});

test('serves imported screenshot images through the scoped project-media protocol', async () => {
  const fx = fixture();
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const handler = createProjectMediaHandler({
      projectStore: { mediaFileForUrl: () => null },
      screenshotStore: fx.store,
    });
    const response = await handler(new Request(asset.src));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('content-length'), String(pngBytes.length));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pngBytes);
  } finally {
    fx.cleanup();
  }
});

test('rejects malformed and traversing screenshot image URLs', async () => {
  const fx = fixture();
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const fileName = path.basename(asset.src);
    const invalidUrls = [
      `project-media://screenshot/${fx.document.id}/media/%2e%2e%2fsecret.png`,
      `project-media://screenshot/${fx.document.id}/media/%2e%2e/secret.png`,
      `project-media://screenshot/${fx.document.id}/media/${fileName}/extra`,
      `project-media://other/${fx.document.id}/media/${fileName}`,
      `project-media://screenshot/not-a-uuid/media/${fileName}`,
      `project-media://screenshot/${fx.document.id}/media/11111111-1111-4111-8111-111111111111.svg`,
    ];
    for (const url of invalidUrls) assert.equal(fx.store.fileForUrl(url), null, url);

    const handler = createProjectMediaHandler({
      projectStore: { mediaFileForUrl: () => null },
      screenshotStore: fx.store,
    });
    const response = await handler(new Request(invalidUrls[0]));
    assert.equal(response.status, 404);
  } finally {
    fx.cleanup();
  }
});

test('does not resolve symlinked screenshot media directories or files', (t) => {
  const fx = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-image-outside-'));
  try {
    const externalFile = path.join(outside, 'secret.png');
    fs.writeFileSync(externalFile, Buffer.from('private'));
    const fileName = '11111111-1111-4111-8111-111111111111.png';
    const mediaDirectory = path.join(fx.screenshotRoot, fx.document.id, 'media');

    fs.symlinkSync(outside, mediaDirectory, 'dir');
    const url = `project-media://screenshot/${fx.document.id}/media/${fileName}`;
    assert.equal(fx.store.fileForUrl(url), null);
    fs.rmSync(mediaDirectory, { force: true });

    fs.mkdirSync(mediaDirectory);
    fs.symlinkSync(externalFile, path.join(mediaDirectory, fileName), 'file');
    assert.equal(fx.store.fileForUrl(url), null);

    const linkedId = '22222222-2222-4222-8222-222222222222';
    fs.rmSync(path.join(fx.screenshotRoot, linkedId), { recursive: true, force: true });
    fs.symlinkSync(outside, path.join(fx.screenshotRoot, linkedId), 'dir');
    assert.equal(fx.store.fileForUrl(`project-media://screenshot/${linkedId}/media/${fileName}`), null);
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(error?.code)) {
      t.skip(`This platform cannot create test symlinks: ${error.message}`);
      return;
    }
    throw error;
  } finally {
    fx.cleanup();
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('validates imported screenshot image payloads and rejects duplicate layer IDs atomically', () => {
  const fx = fixture();
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const valid = screenshotState([importedLayer(asset)]);
    fx.store.save(fx.document.id, valid);
    const metadata = path.join(fx.screenshotRoot, fx.document.id, 'screenshot.json');
    const before = fs.readFileSync(metadata);
    const invalidStates = [
      screenshotState([{ ...importedLayer(asset), source: '/outside/photo.png' }]),
      screenshotState([
        { ...importedLayer(asset), source: `project-media://screenshot/${fx.document.id}/media/../secret.png` },
      ]),
      screenshotState([{ ...importedLayer(asset), width: 0 }]),
      screenshotState([{ ...importedLayer(asset), transform: { x: 0, y: 0, width: 0, height: 1 } }]),
      screenshotState([
        { ...importedLayer(asset), appearance: { ...historicalAppearance('image', true), shadowColor: 'red' } },
      ]),
      screenshotState([{ ...importedLayer(asset), id: 'screenshot' }]),
      screenshotState([importedLayer(asset), importedLayer(asset, { id: 'image-layer-1' })]),
    ];

    for (const state of invalidStates) {
      assert.throws(() => fx.store.save(fx.document.id, state));
      assert.deepEqual(fs.readFileSync(metadata), before);
    }

    assert.deepEqual(fx.store.read(fx.document.id).state.images, valid.images);
  } finally {
    fx.cleanup();
  }
});

test('retains imported media while saved history moves the image through undo and redo', () => {
  const fx = fixture();
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const beforeImage = screenshotState();
    const afterImage = screenshotState([importedLayer(asset)]);
    const historyWithImage = { version: 1, undo: [clone(beforeImage), clone(afterImage)], redo: [] };
    fx.store.save(fx.document.id, afterImage, historyWithImage);

    const reopened = fx.store.read(fx.document.id);
    assert.equal(reopened.history.undo.at(-1).images[0].source, asset.src);
    const undoState = clone(reopened.history.undo.at(-2));
    const undoHistory = {
      version: 1,
      undo: [undoState],
      redo: [clone(reopened.state)],
    };
    fx.store.save(fx.document.id, undoState, undoHistory);

    const afterUndo = fx.store.read(fx.document.id);
    assert.deepEqual(afterUndo.state.images, []);
    assert.equal(afterUndo.history.redo[0].images[0].source, asset.src);
    const imageFile = fx.store.fileForUrl(asset.src);
    assert.ok(imageFile);
    assert.deepEqual(fs.readFileSync(imageFile), pngBytes);

    const redoState = clone(afterUndo.history.redo[0]);
    fx.store.save(fx.document.id, redoState, {
      version: 1,
      undo: [clone(afterUndo.state), clone(redoState)],
      redo: [],
    });
    const afterRedo = fx.store.read(fx.document.id);
    assert.equal(afterRedo.state.images[0].source, asset.src);
    assert.deepEqual(fs.readFileSync(fx.store.fileForUrl(asset.src)), pngBytes);
  } finally {
    fx.cleanup();
  }
});

test('returns null for screenshot image picker cancellation without copying a file', async () => {
  const fx = fixture();
  try {
    const ipc = registerImageIpc(fx, async () => ({ canceled: true, filePaths: [] }));
    const result = await ipc.invoke('screenshot:pick-image', fx.document.id);

    assert.equal(result, null);
    assert.equal(ipc.calls.dialogs.length, 1);
    assert.deepEqual(ipc.calls.dialogs[0], [
      ipc.owner,
      {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      },
    ]);
    assert.deepEqual(fs.readdirSync(path.join(fx.screenshotRoot, fx.document.id)).sort(), [
      'screenshot.json',
      'source.png',
    ]);
  } finally {
    fx.cleanup();
  }
});

test('image picker imports the selected file for its screenshot and blocks untrusted senders', async () => {
  const fx = fixture();
  try {
    let choose = false;
    const ipc = registerImageIpc(fx, async () =>
      choose ? { canceled: false, filePaths: [fx.source] } : { canceled: true, filePaths: [] },
    );
    await assert.rejects(
      Promise.resolve().then(() =>
        ipc.invokeFrom('screenshot:pick-image', 'https://untrusted.example', fx.document.id),
      ),
      /not authorized/i,
    );
    assert.equal(ipc.calls.dialogs.length, 0);

    choose = true;
    const asset = await ipc.invoke('screenshot:pick-image', fx.document.id);
    assert.equal(asset.kind, 'image');
    assert.equal(asset.src, `project-media://screenshot/${fx.document.id}/media/${asset.fileName}`);
    assert.equal(ipc.calls.dialogs.length, 1);
    assert.equal(ipc.calls.owners[0].id, 7);
    assert.deepEqual(fs.readFileSync(fx.store.fileForUrl(asset.src)), pngBytes);
  } finally {
    fx.cleanup();
  }
});

test('rejects imported image references owned by another screenshot in state and history', () => {
  const owner = fixture();
  const other = fixture();
  try {
    const asset = other.store.importImage(other.document.id, other.source);
    const metadata = path.join(owner.screenshotRoot, owner.document.id, 'screenshot.json');
    const before = fs.readFileSync(metadata);

    assert.throws(
      () => owner.store.save(owner.document.id, screenshotState([importedLayer(asset)])),
      /invalid screenshot/i,
    );
    assert.deepEqual(fs.readFileSync(metadata), before);

    const current = screenshotState();
    const history = {
      version: 1,
      undo: [screenshotState([importedLayer(asset)]), clone(current)],
      redo: [],
    };
    assert.throws(() => owner.store.save(owner.document.id, current, history), /invalid screenshot/i);
    assert.deepEqual(fs.readFileSync(metadata), before);
    assert.deepEqual(owner.store.read(owner.document.id).state, null);
  } finally {
    owner.cleanup();
    other.cleanup();
  }
});

test('discards an unreferenced screenshot image but retains assets in state or history', () => {
  const fx = fixture();
  try {
    const currentAsset = fx.store.importImage(fx.document.id, fx.source);
    const currentState = screenshotState([importedLayer(currentAsset)]);
    fx.store.save(fx.document.id, currentState, { version: 1, undo: [clone(currentState)], redo: [] });
    fx.store.discardImage(fx.document.id, currentAsset.src);
    assert.ok(fs.existsSync(fx.store.fileForUrl(currentAsset.src)));

    const historyAsset = fx.store.importImage(fx.document.id, fx.source);
    const emptyState = screenshotState();
    const historyState = screenshotState([importedLayer(historyAsset)]);
    fx.store.save(fx.document.id, emptyState, {
      version: 1,
      undo: [clone(emptyState)],
      redo: [clone(historyState)],
    });
    fx.store.discardImage(fx.document.id, historyAsset.src);
    assert.ok(fs.existsSync(fx.store.fileForUrl(historyAsset.src)));

    const unreferenced = fx.store.importImage(fx.document.id, fx.source);
    const unreferencedPath = fx.store.fileForUrl(unreferenced.src);
    assert.ok(unreferencedPath && fs.existsSync(unreferencedPath));
    fx.store.discardImage(fx.document.id, unreferenced.src);
    assert.equal(fs.existsSync(unreferencedPath), false);
    assert.equal(fx.store.fileForUrl(unreferenced.src), null);
  } finally {
    fx.cleanup();
  }
});

test('image discard rejects cross-screenshot ownership and cannot follow a media symlink', (t) => {
  const fx = fixture();
  const other = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-discard-outside-'));
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const assetPath = fx.store.fileForUrl(asset.src);
    assert.ok(assetPath);
    assert.throws(() => other.store.discardImage(other.document.id, asset.src), /owner|screenshot|invalid/i);
    assert.ok(fs.existsSync(assetPath));

    const externalFile = path.join(outside, '33333333-3333-4333-8333-333333333333.png');
    fs.writeFileSync(externalFile, Buffer.from('outside'));
    const mediaDirectory = path.join(fx.screenshotRoot, fx.document.id, 'media');
    fs.rmSync(mediaDirectory, { recursive: true, force: true });
    fs.symlinkSync(outside, mediaDirectory, 'dir');
    const linkedUrl = `project-media://screenshot/${fx.document.id}/media/${path.basename(externalFile)}`;
    try {
      fx.store.discardImage(fx.document.id, linkedUrl);
    } catch {
      // A rejected symlink URL is also a safe failure.
    }
    assert.equal(fs.readFileSync(externalFile, 'utf8'), 'outside');
    assert.equal(fs.lstatSync(mediaDirectory).isSymbolicLink(), true);
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(error?.code)) {
      t.skip(`This platform cannot create test symlinks: ${error.message}`);
      return;
    }
    throw error;
  } finally {
    fx.cleanup();
    other.cleanup();
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('screenshot image discard IPC enforces sender trust before removing scoped media', async () => {
  const fx = fixture();
  try {
    const asset = fx.store.importImage(fx.document.id, fx.source);
    const imagePath = fx.store.fileForUrl(asset.src);
    assert.ok(imagePath);
    const ipc = registerImageIpc(fx, async () => ({ canceled: true, filePaths: [] }));

    await assert.rejects(
      Promise.resolve().then(() =>
        ipc.invokeFrom('screenshot:discard-image', 'https://untrusted.example', fx.document.id, asset.src),
      ),
      /not authorized/i,
    );
    assert.ok(fs.existsSync(imagePath));

    await ipc.invoke('screenshot:discard-image', { id: fx.document.id, source: asset.src });
    assert.equal(fs.existsSync(imagePath), false);
  } finally {
    fx.cleanup();
  }
});
