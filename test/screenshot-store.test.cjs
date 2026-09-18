const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createScreenshotStore } = require('../electron/screenshot/screenshot-store.cjs');
const { historicalAppearance } = require('../electron/projects/composition-appearance.cjs');

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const makeStore = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-store-'));
  return { root, store: createScreenshotStore(root) };
};
const validShape = (patch = {}) => ({
  kind: 'shape',
  family: 'shape',
  id: 'shape-1',
  transform: { x: 0.3, y: 0.3, width: 0.4, height: 0.3 },
  enabled: true,
  rotation: 0,
  borderWidth: 0,
  shadowBlur: 32,
  ...patch,
});
const validCursor = (patch = {}) => ({
  id: 'cursor-1',
  name: 'Static cursor',
  enabled: true,
  position: { x: 0.45, y: 0.45 },
  size: 45,
  rotation: 0,
  selection: { packId: 'builtin:macos', mode: 'fixed', cursorId: 'default' },
  color: '#000000',
  shadowEnabled: true,
  shadowBlur: 6,
  shadowColor: '#000000',
  shadowDirection: 'bottom',
  ...patch,
});
const validState = (patch = {}) => {
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
const clone = (value) => JSON.parse(JSON.stringify(value));
const validHistory = (state) => ({
  version: 1,
  undo: [clone(state)],
  redo: [validState({ quality: 0.8 })],
});
const metadataFile = (root, id) => path.join(root, id, 'screenshot.json');
const temporaryMetadataFiles = (file) =>
  fs
    .readdirSync(path.dirname(file))
    .filter((name) => name.startsWith(path.basename(file) + '.') && name.endsWith('.tmp'));

test('creates, completes, lists, reads and resolves an opaque screenshot URL', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    assert.match(pending.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(pending.path, path.join(fixture.root, pending.id, 'source.png'));
    assert.equal(fs.existsSync(pending.path), false);

    fs.writeFileSync(pending.path, pngBytes);
    const completed = fixture.store.complete(pending.id, { width: 1920, height: 1080 }, { background: 'studio' });

    assert.equal(completed.id, pending.id);
    assert.equal(completed.width, 1920);
    assert.equal(completed.height, 1080);
    assert.deepEqual(completed.preset, { background: 'studio' });
    assert.equal(completed.state, null);
    assert.equal(completed.source, 'project-media://screenshot/' + pending.id + '/source.png');
    assert.deepEqual(fixture.store.read(pending.id), completed);
    assert.deepEqual(fixture.store.list(), [completed]);
    assert.equal(fixture.store.fileForUrl(completed.source), pending.path);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('uses a validated custom name when completing a canvas screenshot', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fs.writeFileSync(pending.path, pngBytes);
    const completed = fixture.store.complete(
      pending.id,
      { width: 1920, height: 1080 },
      { background: 'studio' },
      '  Product demo — Sep 18, 2026  ',
    );

    assert.equal(completed.name, 'Product demo — Sep 18, 2026');
    assert.throws(
      () => fixture.store.complete(fixture.store.create().id, { width: 10, height: 10 }, {}, '   '),
      /invalid screenshot name/i,
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects UUID traversal and malformed screenshot media URLs', () => {
  const fixture = makeStore();
  try {
    for (const id of ['../outside', '..', 'not-a-uuid', '00000000-0000-0000-0000-000000000000/../../secret']) {
      assert.throws(() => fixture.store.read(id), /identifier/i);
      assert.throws(() => fixture.store.remove(id), /identifier/i);
    }

    for (const url of [
      'project-media://screenshot/%2e%2e/source.png',
      'project-media://screenshot/%2e%2e%2foutside/source.png',
      'project-media://screenshot/../../outside/source.png',
      'project-media://other/11111111-1111-4111-8111-111111111111/source.png',
      'project-media://screenshot/11111111-1111-4111-8111-111111111111/source.png/extra',
    ]) {
      assert.equal(fixture.store.fileForUrl(url), null, url);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects symlinked screenshot directories and source files', (t) => {
  const fixture = makeStore();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-outside-'));
  try {
    const outsideSource = path.join(externalRoot, 'private.png');
    fs.writeFileSync(outsideSource, pngBytes);

    const linkedId = '11111111-1111-4111-8111-111111111111';
    fs.symlinkSync(externalRoot, path.join(fixture.root, linkedId), 'dir');
    assert.throws(() => fixture.store.read(linkedId), /screenshot directory/i);
    assert.throws(() => fixture.store.complete(linkedId, { width: 10, height: 10 }, {}), /screenshot directory/i);
    assert.equal(fixture.store.fileForUrl('project-media://screenshot/' + linkedId + '/source.png'), null);

    const pending = fixture.store.create();
    const document = fixture.store.complete(pending.id, { width: 10, height: 10 }, {});
    fs.symlinkSync(outsideSource, pending.path, 'file');
    assert.equal(fixture.store.fileForUrl(document.source), null);
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(error?.code)) {
      t.skip('This platform cannot create test symlinks: ' + error.message);
      return;
    }
    throw error;
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('does not read screenshot metadata through a symlink', (t) => {
  const fixture = makeStore();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-metadata-outside-'));
  try {
    const pending = fixture.store.create();
    const metadata = fixture.store.complete(pending.id, { width: 64, height: 48 }, {});
    const outsideDocument = path.join(externalRoot, 'external.json');
    fs.writeFileSync(
      outsideDocument,
      JSON.stringify({
        schemaVersion: 1,
        id: pending.id,
        name: 'External document',
        width: 64,
        height: 48,
      }),
    );
    fs.rmSync(metadataFile(fixture.root, pending.id));
    fs.symlinkSync(outsideDocument, metadataFile(fixture.root, pending.id), 'file');

    assert.throws(() => fixture.store.read(metadata.id));
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(error?.code)) {
      t.skip('This platform cannot create test symlinks: ' + error.message);
      return;
    }
    throw error;
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('refuses a UUID-scoped temporary symlink instead of overwriting its target', (t) => {
  const fixture = makeStore();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-temp-outside-'));
  const externalFile = path.join(externalRoot, 'keep.txt');
  let injectedTemporary = null;
  const originalWriteFileSync = fs.writeFileSync;
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 64, height: 48 }, {});
    fixture.store.save(pending.id, validState());
    const before = fixture.store.read(pending.id);
    const marker = Buffer.from('do not overwrite');
    fs.writeFileSync(externalFile, marker);

    fs.writeFileSync = function (file, data, options) {
      if (typeof file === 'string' && file.endsWith('.tmp')) {
        injectedTemporary = file;
        fs.symlinkSync(externalFile, file, 'file');
      }
      return originalWriteFileSync.call(fs, file, data, options);
    };
    assert.throws(() => fixture.store.save(pending.id, validState({ quality: 0.8 })), { code: 'EEXIST' });
    fs.writeFileSync = originalWriteFileSync;

    assert.deepEqual(fs.readFileSync(externalFile), marker);
    assert.deepEqual(fixture.store.read(pending.id), before);
    assert.equal(fs.lstatSync(injectedTemporary).isSymbolicLink(), true);
  } catch (error) {
    if (['EACCES', 'EPERM', 'ENOTSUP', 'EINVAL'].includes(error?.code)) {
      t.skip('This platform cannot create test symlinks: ' + error.message);
      return;
    }
    throw error;
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    if (injectedTemporary) fs.rmSync(injectedTemporary, { force: true });
    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  }
});

test('rejects invalid capture dimensions before creating screenshot metadata', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    const invalidDimensions = [
      { width: 0, height: 1 },
      { width: -1, height: 1 },
      { width: 1.5, height: 1 },
      { width: 16_385, height: 1 },
      { width: 8_193, height: 8_193 },
    ];
    for (const dimensions of invalidDimensions) {
      assert.throws(
        () => fixture.store.complete(pending.id, dimensions, {}),
        /invalid screenshot dimensions/i,
        JSON.stringify(dimensions),
      );
      assert.equal(fs.existsSync(metadataFile(fixture.root, pending.id)), false);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects persisted metadata with invalid capture dimensions', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fs.writeFileSync(
      metadataFile(fixture.root, pending.id),
      JSON.stringify({ schemaVersion: 1, id: pending.id, width: 16_385, height: 1 }),
    );
    assert.throws(() => fixture.store.read(pending.id), /invalid screenshot document/i);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('validates screenshot settings and atomically replaces the persisted document', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 1920, height: 1080 }, {});
    const file = metadataFile(fixture.root, pending.id);
    const beforeInvalidWrites = fs.readFileSync(file);

    const invalidStates = [
      validState({ format: 'jpeg' }),
      validState({ quality: 1.01 }),
      validState({ blurPercent: 101 }),
      validState({ canvas: { width: 0, height: 720 } }),
      validState({ canvas: { width: 16384, height: 4097 } }),
      validState({ canvas: { showBackground: 'yes' } }),
      validState({ image: { id: 'screenshot', kind: 'image', transform: { x: 0, y: 0, width: 0, height: 1 } } }),
      validState({
        image: { ...validState().image, appearance: { ...historicalAppearance('screen', true), shadowColor: 'red' } },
      }),
      validState({ shapes: Array.from({ length: 501 }, () => ({})) }),
      validState({ shapes: [validShape({ family: 'unknown' })] }),
      validState({ shapes: [validShape({ id: 'screenshot' })] }),
      validState({ shapes: [validShape({ transform: { x: 0, y: 0, width: 0, height: 1 } })] }),
      validState({ background: { kind: 'invalid' } }),
    ];
    for (const state of invalidStates) {
      assert.throws(() => fixture.store.save(pending.id, state));
      assert.deepEqual(fs.readFileSync(file), beforeInvalidWrites);
    }

    const savedState = validState({ shapes: [validShape()] });
    fixture.store.save(pending.id, savedState);
    assert.deepEqual(fixture.store.read(pending.id).state, savedState);
    assert.deepEqual(temporaryMetadataFiles(file), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('persists screenshot history, drops it when omitted on save, and still reads legacy documents', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 1920, height: 1080 }, {});
    const state = validState();
    state.image.enabled = true;
    const history = validHistory(state);

    fixture.store.save(pending.id, state, history);
    assert.deepEqual(fixture.store.read(pending.id).history, history);
    assert.deepEqual(fixture.store.read(pending.id).state, state);

    fixture.store.save(pending.id, state);
    const savedWithoutHistory = fixture.store.read(pending.id);
    assert.equal(Object.hasOwn(savedWithoutHistory, 'history'), false);
    assert.deepEqual(savedWithoutHistory.state, state);

    // Schema v1 projects created before undo/redo support contain no history.
    const legacy = fixture.store.complete(fixture.store.create().id, { width: 640, height: 480 }, {});
    assert.equal(Object.hasOwn(legacy, 'history'), false);
    assert.deepEqual(fixture.store.read(legacy.id), legacy);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('ignores invalid persisted history while keeping the screenshot document and current state readable', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 1920, height: 1080 }, {});
    const state = validState();
    state.image.enabled = true;
    fixture.store.save(pending.id, state, validHistory(state));

    const file = metadataFile(fixture.root, pending.id);
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.history = { version: 1, undo: [], redo: [] };
    fs.writeFileSync(file, JSON.stringify(document));

    const recovered = fixture.store.read(pending.id);
    assert.equal(recovered.id, pending.id);
    assert.deepEqual(recovered.state, state);
    assert.equal(Object.hasOwn(recovered, 'history'), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('preserves the previous screenshot document when atomic replacement fails', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 1920, height: 1080 }, {});
    fixture.store.save(pending.id, validState());
    const file = metadataFile(fixture.root, pending.id);
    const beforeFailedWrite = fixture.store.read(pending.id);
    const originalRenameSync = fs.renameSync;

    fs.renameSync = (source, target) => {
      if (target === file) throw new Error('simulated atomic replace failure');
      return originalRenameSync.call(fs, source, target);
    };
    try {
      assert.throws(
        () => fixture.store.save(pending.id, validState({ canvas: { width: 640, height: 480 } })),
        /simulated atomic replace failure/,
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }

    assert.deepEqual(fixture.store.read(pending.id), beforeFailedWrite);
    assert.deepEqual(temporaryMetadataFiles(file), []);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('persists source cropping and rejects crops outside the captured image without overwriting edits', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 1920, height: 1080 }, {});
    const state = validState();
    state.image.crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
    fixture.store.save(pending.id, state);
    assert.deepEqual(fixture.store.read(pending.id).state.image.crop, state.image.crop);
    for (const crop of [
      true,
      {},
      { x: -0.1, y: 0, width: 1, height: 1 },
      { x: 0.9, y: 0, width: 0.2, height: 1 },
      { x: 0, y: 0, width: 0, height: 1 },
      { x: 0, y: 0, width: 1, height: Infinity },
      { x: 0, y: 0, width: 1, height: '1' },
    ]) {
      assert.throws(
        () => fixture.store.save(pending.id, { ...state, image: { ...state.image, crop } }),
        /invalid screenshot settings/i,
      );
      assert.deepEqual(fixture.store.read(pending.id).state.image.crop, state.image.crop);
    }
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('round trips static cursors and their explicit back-to-front layer order', () => {
  const fixture = makeStore();
  try {
    const pending = fixture.store.create();
    fixture.store.complete(pending.id, { width: 1920, height: 1080 }, {});
    const state = validState({ shapes: [validShape()] });
    state.cursors = [validCursor()];
    state.composition = [
      { id: '__watermark__', opacity: 40, blendMode: 'screen', locked: false },
      { id: 'cursor-1', opacity: 70, blendMode: 'multiply', locked: true },
      { id: 'shape-1', opacity: 35, blendMode: 'overlay', locked: false },
      { id: 'screenshot', opacity: 100, blendMode: 'source-over', locked: true },
      { id: '__background__', opacity: 0, blendMode: 'source-over', locked: false },
    ];

    fixture.store.save(pending.id, state);
    const reloaded = fixture.store.read(pending.id).state;

    assert.deepEqual(reloaded.cursors, state.cursors);
    assert.deepEqual(reloaded.cursors[0].selection, {
      packId: 'builtin:macos',
      mode: 'fixed',
      cursorId: 'default',
    });
    assert.deepEqual(reloaded.composition, state.composition);
    assert.deepEqual(
      reloaded.composition.map(({ id }) => id),
      ['__watermark__', 'cursor-1', 'shape-1', 'screenshot', '__background__'],
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
