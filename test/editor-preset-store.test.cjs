const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  DEFAULT_PRESET_ID,
  SCHEMA_VERSION,
  createEditorPresetStore,
} = require('../electron/presets/editor-preset-store.cjs');

const roots = [];
const temporaryFile = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-editor-presets-'));
  roots.push(root);
  return path.join(root, 'editor-presets.json');
};

test.afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('migrates legacy editor defaults into a protected Default preset', () => {
  const file = temporaryFile();
  const store = createEditorPresetStore(file, {
    readPreferences: () => ({
      devices: { cameraId: 'camera-1', micId: 'mic-1' },
      extras: {
        editorDefaults: { schemaVersion: 1, presentation: { selectedBackgroundId: 'wallpaper-1' } },
        exportSettings: { format: 'webm', preset: 'high' },
      },
    }),
  });

  const migrated = store.read();
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.activePresetId, DEFAULT_PRESET_ID);
  assert.deepEqual(migrated.presets, [
    {
      id: DEFAULT_PRESET_ID,
      name: 'Default',
      protected: true,
      updatedAt: new Date(0).toISOString(),
      settings: {
        editor: { schemaVersion: 1, presentation: { selectedBackgroundId: 'wallpaper-1' } },
        devices: { cameraId: 'camera-1', micId: 'mic-1' },
        export: { format: 'webm', preset: 'high' },
        quickSnip: { automaticZoom: true },
      },
    },
  ]);
});

test('adds Default while preserving valid named presets and repairs the active selection', () => {
  const file = temporaryFile();
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 99,
      activePresetId: 'missing',
      presets: [
        {
          id: 'studio',
          name: ' Studio ',
          protected: true,
          settings: { editor: { canvas: '16:9' }, quickSnip: { automaticZoom: false } },
        },
        { id: 'studio', name: 'Duplicate', settings: {} },
        { id: '', name: 'Invalid', settings: {} },
      ],
    }),
  );

  const document = createEditorPresetStore(file).read();
  assert.equal(document.activePresetId, DEFAULT_PRESET_ID);
  assert.deepEqual(
    document.presets.map(({ id, name, protected: isProtected }) => ({ id, name, protected: isProtected })),
    [
      { id: DEFAULT_PRESET_ID, name: 'Default', protected: true },
      { id: 'studio', name: 'Studio', protected: false },
    ],
  );
  assert.deepEqual(document.presets[1].settings.quickSnip, { automaticZoom: false });
});

test('creates presets by cloning Default and protects Default from CRUD mutations', () => {
  const file = temporaryFile();
  const store = createEditorPresetStore(file);
  const defaults = store.update(DEFAULT_PRESET_ID, {
    editor: { canvas: { preset: '9:16' } },
    devices: { micId: 'mic-default' },
    export: { format: 'webm' },
    quickSnip: { automaticZoom: false },
  });

  const created = store.create('  Tutorial  ');
  const named = created.presets.find((preset) => preset.id !== DEFAULT_PRESET_ID);
  assert.ok(named);
  assert.equal(created.activePresetId, named.id);
  assert.equal(named.name, 'Tutorial');
  assert.equal(named.protected, false);
  assert.deepEqual(named.settings, defaults.presets[0].settings);

  const changed = store.update(named.id, { devices: { micId: 'mic-named' } });
  assert.equal(changed.presets.find((preset) => preset.id === DEFAULT_PRESET_ID).settings.devices.micId, 'mic-default');
  assert.equal(changed.presets.find((preset) => preset.id === named.id).settings.devices.micId, 'mic-named');

  assert.throws(() => store.rename(DEFAULT_PRESET_ID, 'Renamed'), /cannot be renamed/i);
  assert.throws(() => store.remove(DEFAULT_PRESET_ID), /cannot be deleted/i);
  assert.throws(() => store.update('missing', {}), /not found/i);
  assert.throws(() => store.create('tutorial'), /already exists/i);
});

test('renames, selects, removes, and updates the active named preset', () => {
  const file = temporaryFile();
  const store = createEditorPresetStore(file);
  const created = store.create('Demo');
  const id = created.activePresetId;

  const renamed = store.rename(id, 'Product Demo');
  assert.equal(renamed.presets.find((preset) => preset.id === id).name, 'Product Demo');
  const updated = store.updateActive({ quickSnip: { automaticZoom: false } });
  assert.equal(updated.presets.find((preset) => preset.id === id).settings.quickSnip.automaticZoom, false);

  const selectedDefault = store.select(DEFAULT_PRESET_ID);
  assert.equal(selectedDefault.activePresetId, DEFAULT_PRESET_ID);
  const removed = store.remove(id);
  assert.equal(
    removed.presets.some((preset) => preset.id === id),
    false,
  );
  assert.equal(removed.activePresetId, DEFAULT_PRESET_ID);
});

test('persists atomically and keeps the previous document as a backup', () => {
  const file = temporaryFile();
  const backup = `${file}.bak`;
  const store = createEditorPresetStore(file);
  const first = store.create('First');
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), first);

  const second = store.select(DEFAULT_PRESET_ID);
  assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')), first);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), second);
  assert.equal(fs.existsSync(`${file}.${process.pid}.tmp`), false);
});

test('falls back to the backup when the primary preset document is corrupt', () => {
  const file = temporaryFile();
  const store = createEditorPresetStore(file);
  const previous = store.create('Recoverable');
  store.select(DEFAULT_PRESET_ID);
  fs.writeFileSync(file, '{"presets":');

  const recovered = store.read();
  assert.equal(recovered.activePresetId, previous.activePresetId);
  assert.equal(
    recovered.presets.some((preset) => preset.name === 'Recoverable'),
    true,
  );
});

test('normalizes invalid documents and settings without exposing malformed values', () => {
  const file = temporaryFile();
  fs.writeFileSync(
    file,
    JSON.stringify({
      activePresetId: 'valid',
      presets: [
        null,
        { id: 'valid', name: ' Valid ', settings: { devices: [], quickSnip: { automaticZoom: 'yes' } } },
        { id: 'valid', name: 'Duplicate', settings: {} },
        { id: 'invalid', name: '', settings: {} },
      ],
    }),
  );

  const normalized = createEditorPresetStore(file).read();
  const valid = normalized.presets.find((preset) => preset.id === 'valid');
  assert.equal(normalized.activePresetId, 'valid');
  assert.ok(valid);
  assert.deepEqual(valid.settings.devices, normalized.presets[0].settings.devices);
  assert.equal(valid.settings.quickSnip.automaticZoom, true);
  assert.equal(normalized.presets.filter((preset) => preset.id === 'valid').length, 1);
  assert.equal(normalized.presets.filter((preset) => preset.id === 'invalid').length, 0);
});
