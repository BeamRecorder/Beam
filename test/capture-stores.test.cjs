const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createCaptureStores } = require('../electron/storage/capture-stores.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-capture-stores-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const applicationRoot = path.join(root, 'app');
  const wallpaperDirectory = path.join(applicationRoot, 'public', 'wallpapers', 'image');
  fs.mkdirSync(wallpaperDirectory, { recursive: true });
  fs.writeFileSync(path.join(wallpaperDirectory, 'baseline.webp'), 'bundled image');
  const userRoot = path.join(root, 'user');
  const userPaths = {
    editorPresets: path.join(userRoot, 'editor-presets.json'),
    screenshotPresets: path.join(userRoot, 'screenshot-presets.json'),
    screenshots: path.join(userRoot, 'projects', 'screenshot'),
  };
  const preferences = {
    schemaVersion: 3,
    devices: { micId: 'preferred-mic', cameraId: 'preferred-camera' },
    extras: {
      captureMode: 'studio',
      editorDefaults: { schemaVersion: 78, marker: 'saved video editor settings' },
      exportSettings: { format: 'webm', quality: 0.73, marker: 'saved video export settings' },
      keepThisPreference: 'unchanged',
    },
  };
  const preferenceSnapshot = JSON.parse(JSON.stringify(preferences));
  const preferencesStore = { read: () => preferences };
  const stores = createCaptureStores({ userPaths, preferencesStore, applicationRoot, isPackaged: false });
  return { root, userPaths, preferences, preferenceSnapshot, stores };
}

test('keeps video preferences and the screenshot preset baseline separate', (t) => {
  const f = fixture(t);
  const video = f.stores.editorPresetStore.read();
  const screenshot = f.stores.screenshotPresetStore.read();
  const videoDefault = video.presets.find((preset) => preset.id === 'default');
  const screenshotDefault = screenshot.presets.find((preset) => preset.id === 'default');

  assert.deepEqual(videoDefault.settings.editor, f.preferenceSnapshot.extras.editorDefaults);
  assert.deepEqual(videoDefault.settings.devices, f.preferenceSnapshot.devices);
  assert.deepEqual(videoDefault.settings.export, f.preferenceSnapshot.extras.exportSettings);
  assert.equal(screenshotDefault.settings.editor.schemaVersion, 1);
  assert.equal(screenshotDefault.settings.editor.presentation.blurPercent, 30);
  assert.equal(screenshotDefault.settings.editor.presentation.selectedBackgroundId, '/wallpapers/image/baseline.webp');
  assert.deepEqual(screenshotDefault.settings.export, { format: 'png', quality: 0.95 });
  assert.deepEqual(f.preferences, f.preferenceSnapshot);
  assert.notEqual(f.stores.editorPresetStore.file, f.stores.screenshotPresetStore.file);
});

test('editing the video default does not mutate screenshot settings or preferences', (t) => {
  const f = fixture(t);
  const video = f.stores.editorPresetStore.read();
  const screenshot = f.stores.screenshotPresetStore.read();
  const screenshotEditorBaseline = screenshot.presets[0].settings.editor;
  const settings = {
    ...video.presets[0].settings,
    editor: { schemaVersion: 99, marker: 'edited video settings' },
    export: { format: 'mp4', quality: 0.42 },
  };

  f.stores.editorPresetStore.updateActive(settings);

  assert.deepEqual(f.stores.editorPresetStore.read().presets[0].settings.editor, settings.editor);
  assert.deepEqual(f.stores.screenshotPresetStore.read().presets[0].settings.editor, screenshotEditorBaseline);
  assert.deepEqual(f.stores.screenshotPresetStore.read().presets[0].settings.export, {
    format: 'png',
    quality: 0.95,
  });
  assert.deepEqual(f.preferences, f.preferenceSnapshot);
});

test('creates screenshots under the configured screenshot project root', (t) => {
  const f = fixture(t);
  const pending = f.stores.screenshotStore.create();

  assert.ok(pending.path.startsWith(f.userPaths.screenshots + path.sep));
  assert.equal(fs.existsSync(pending.path), false);
  f.stores.screenshotStore.remove(pending.id);
});
