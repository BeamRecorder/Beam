const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createScreenshotStore } = require('../apps/desktop/electron/screenshot/screenshot-store.cjs');
const { createBlankScreenshot } = require('../apps/desktop/electron/screenshot/blank-screenshot.cjs');
const { registerProjectIpc } = require('../apps/desktop/electron/projects/project-ipc.cjs');
const preset = {
  export: { resolution: '1080p', format: 'png' },
  editor: {
    presentation: {
      canvas: { preset: '16:9', padding: 0.1, showBackground: true },
      background: { kind: 'color', color: '#123456' },
    },
  },
};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-blank-screenshot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createScreenshotStore(root);
  const pixels = [];
  const nativeImage = {
    createFromBitmap: (bytes, dimensions) => {
      pixels.push({ bytes, dimensions });
      return { toPNG: () => Buffer.from('encoded PNG') };
    },
  };
  const presetStore = { read: () => ({ activePresetId: 'current', presets: [{ id: 'current', settings: preset }] }) };
  return { root, pixels, dependencies: { store, presetStore, nativeImage } };
}
test('creates a named editable transparent PNG canvas with the active Screenshot preset', (t) => {
  const { pixels, dependencies } = fixture(t);
  const original = structuredClone(preset);
  const document = createBlankScreenshot(dependencies, { width: 800, height: 450, name: 'Walkthrough' });
  assert.equal(document.name, 'Walkthrough');
  assert.equal(document.width, 800);
  assert.equal(document.height, 450);
  assert.equal(document.state, null);
  assert.deepEqual(pixels[0].dimensions, { width: 800, height: 450 });
  assert.equal(pixels[0].bytes.length, 800 * 450 * 4);
  assert.ok(pixels[0].bytes.every((byte) => byte === 0));
  assert.deepEqual(document.preset.editor.presentation.canvas, {
    preset: 'custom',
    padding: 0.1,
    showBackground: false,
    width: 800,
    height: 450,
  });
  assert.equal(document.preset.export.resolution, 'custom');
  assert.deepEqual(document.preset.editor.presentation.background, original.editor.presentation.background);
  assert.deepEqual(preset, original);
  assert.equal(dependencies.store.readSummary(document.id).mode, 'screenshot');
  assert.ok(dependencies.store.fileForUrl(document.source));
});
test('generates a name and preserves odd canvas dimensions', (t) => {
  const { dependencies } = fixture(t);
  const document = createBlankScreenshot(dependencies, { width: 801, height: 451 });
  assert.match(document.name, /^Screenshot /);
  assert.equal(document.width, 801);
  assert.equal(document.height, 451);
});
for (const [width, height] of [
  [undefined, undefined],
  [0, 20],
  [1, 20],
  [20, -1],
  [8193, 2],
  [2, 8193],
  [8192, 8192],
  [20.5, 20],
  ['20', 20],
  [NaN, 20],
]) {
  test(`rejects invalid dimensions ${width} × ${height} before creating files`, (t) => {
    const { root, pixels, dependencies } = fixture(t);
    assert.throws(() => createBlankScreenshot(dependencies, { width, height }), /valid screenshot dimensions/);
    assert.deepEqual(fs.readdirSync(root), []);
    assert.equal(pixels.length, 0);
  });
}
test('rejects a missing active preset before creating files', (t) => {
  const { root, dependencies } = fixture(t);
  dependencies.presetStore.read = () => ({ activePresetId: 'missing', presets: [] });
  assert.throws(() => createBlankScreenshot(dependencies, { width: 800, height: 450 }), /preset is unavailable/);
  assert.deepEqual(fs.readdirSync(root), []);
});
for (const stage of ['encode', 'write', 'complete']) {
  test(`removes incomplete projects on ${stage} failure`, (t) => {
    const { root, dependencies } = fixture(t);
    if (stage === 'encode')
      dependencies.nativeImage.createFromBitmap = () => {
        throw new Error('encoding failed');
      };
    if (stage === 'write') {
      const create = dependencies.store.create;
      dependencies.store.create = () => ({ ...create(), path: path.join(root, 'missing', 'source.png') });
    }
    if (stage === 'complete')
      dependencies.store.complete = () => {
        throw new Error('metadata failed');
      };
    assert.throws(() => createBlankScreenshot(dependencies, { width: 800, height: 450 }));
    assert.deepEqual(fs.readdirSync(root), []);
  });
}
function ipcFixture(t, trusted = true) {
  const { dependencies, pixels, root } = fixture(t);
  const handlers = new Map();
  const videoCalls = [];
  registerProjectIpc(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    {
      create: (options) => {
        videoCalls.push(options);
        return { id: 'video', mode: 'studio' };
      },
    },
    {},
    {},
    {},
    {},
    () => trusted,
    {},
    dependencies.store,
    {},
    { screenshotPresetStore: dependencies.presetStore, nativeImage: dependencies.nativeImage },
  );
  const event = { sender: { getURL: () => 'file:///hud-panel.html' } };
  return { create: (input) => handlers.get('projects:create')(event, input), dependencies, videoCalls, pixels, root };
}
test('New project IPC creates Screenshot catalog entries with readable source assets', (t) => {
  const { create, dependencies, videoCalls, pixels } = ipcFixture(t);
  const result = create({ mode: 'screenshot', name: '  My screenshot  ' });
  assert.equal(result.mode, 'screenshot');
  assert.equal(result.name, 'My screenshot');
  assert.equal(result.sessionCount, 0);
  assert.equal(result.previewSrc, null);
  assert.equal(dependencies.store.read(result.id).width, 1920);
  assert.equal(dependencies.store.read(result.id).height, 1080);
  assert.equal(pixels[0].bytes.length, 1920 * 1080 * 4);
  assert.equal(videoCalls.length, 0);
});
test('New project IPC allows empty Screenshot names and keeps Video as the first-run choice', (t) => {
  const { create, videoCalls } = ipcFixture(t);
  assert.match(create({ mode: 'screenshot', name: '  ' }).name, /^Screenshot /);
  assert.match(create({ mode: 'screenshot' }).name, /^Screenshot /);
  assert.equal(create().mode, 'studio');
  assert.equal(create({ mode: 'studio', name: 'Demo' }).mode, 'studio');
  assert.deepEqual(videoCalls, [{ name: undefined }, { name: 'Demo' }]);
});
test('New project IPC rejects foreign senders before touching either store', (t) => {
  const { create, root, videoCalls } = ipcFixture(t, false);
  assert.throws(() => create({ mode: 'screenshot' }), /non autorisé/);
  assert.throws(() => create({ mode: 'studio' }), /non autorisé/);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.deepEqual(videoCalls, []);
});
for (const input of [
  null,
  [],
  'screenshot',
  42,
  { name: 42 },
  { mode: null },
  { mode: 'instant' },
  { mode: 'image' },
  { source: '/tmp/screen.png' },
]) {
  test(`New project IPC rejects malformed options ${JSON.stringify(input)}`, (t) => {
    const { create, root, videoCalls } = ipcFixture(t);
    assert.throws(() => create(input), /Invalid new project options/);
    assert.deepEqual(fs.readdirSync(root), []);
    assert.deepEqual(videoCalls, []);
  });
}
