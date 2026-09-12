const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createEditorPresetStore } = require('../electron/presets/editor-preset-store.cjs');
const { initialEditorSettings } = require('../electron/presets/initial-editor-settings.cjs');

const roots = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-initial-editor-settings-'));
  roots.push(root);
  return root;
}

function bundledImageDirectory(applicationRoot, isPackaged = false) {
  const directory = path.join(applicationRoot, isPackaged ? 'dist' : 'public', 'wallpapers', 'image');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

test.afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('chooses a bundled image deterministically and persists that randomized choice in Default', () => {
  const applicationRoot = temporaryRoot();
  const directory = bundledImageDirectory(applicationRoot);
  for (const name of ['zebra.jpg', 'amber.webp', 'blue.PNG', 'movie.mp4', 'readme.txt', 'animated.gif', 'vector.svg']) {
    fs.writeFileSync(path.join(directory, name), 'asset');
  }

  let randomCalls = 0;
  const settings = initialEditorSettings(applicationRoot, false, () => {
    randomCalls += 1;
    return 0.99;
  });

  assert.equal(randomCalls, 1);
  assert.equal(settings.presentation.selectedBackgroundId, '/wallpapers/image/zebra.jpg');

  let randomValue = 0.99;
  const presetFile = path.join(applicationRoot, 'user-data', 'editor-presets.json');
  const readPreferences = () => ({
    extras: { editorDefaults: initialEditorSettings(applicationRoot, false, () => randomValue) },
  });
  const initialDocument = createEditorPresetStore(presetFile, { readPreferences }).read();
  const persistedBackground = initialDocument.presets[0].settings.editor.presentation.selectedBackgroundId;
  assert.equal(persistedBackground, '/wallpapers/image/zebra.jpg');

  randomValue = 0;
  const reopenedDocument = createEditorPresetStore(presetFile, { readPreferences }).read();
  assert.equal(reopenedDocument.presets[0].settings.editor.presentation.selectedBackgroundId, persistedBackground);
});

test('uses the packaged wallpaper directory and filters candidates to real supported image files', () => {
  const applicationRoot = temporaryRoot();
  const directory = bundledImageDirectory(applicationRoot, true);
  fs.writeFileSync(path.join(directory, 'first.png'), 'image');
  fs.writeFileSync(path.join(directory, 'second.jpeg'), 'image');
  fs.writeFileSync(path.join(directory, 'clip.webm'), 'video');
  fs.mkdirSync(path.join(directory, 'folder.png'));

  const settings = initialEditorSettings(applicationRoot, true, () => 0.5);

  assert.equal(settings.presentation.selectedBackgroundId, '/wallpapers/image/second.jpeg');
});

test('sets the screenshot baseline blur, strong black frame shadow, and spring-only click effects', () => {
  const applicationRoot = temporaryRoot();
  const directory = bundledImageDirectory(applicationRoot);
  fs.writeFileSync(path.join(directory, 'wallpaper.webp'), 'image');

  const settings = initialEditorSettings(applicationRoot, false, () => 0);
  const { presentation, visual } = settings;

  assert.equal(presentation.blurPercent, 30);
  assert.equal(visual.screen.appearance.shadowSize, 'lg');
  assert.equal(visual.screen.appearance.shadowColor, '#000000');
  assert.equal(visual.screen.appearance.shadowDirection, 'all');
  assert.equal(visual.image.appearance.shadowSize, 'lg');
  assert.equal(visual.image.appearance.shadowColor, '#000000');
  assert.equal(visual.image.appearance.shadowDirection, 'all');

  for (const effect of [presentation.cursor.clickEffects.left, presentation.cursor.clickEffects.right]) {
    assert.equal(effect.springEnabled, true);
    assert.equal(effect.springIntensity, 50);
    assert.equal(effect.rippleEnabled, false);
    assert.equal(effect.rippleStyle, 'none');
  }
});

test('fails with a clear error when the bundled screenshot background directory or images are missing', () => {
  const missingRoot = temporaryRoot();
  assert.throws(() => initialEditorSettings(missingRoot, false, () => 0), /bundled screenshot backgrounds/i);

  const emptyRoot = temporaryRoot();
  const directory = bundledImageDirectory(emptyRoot);
  fs.writeFileSync(path.join(directory, 'video.mp4'), 'video');
  fs.writeFileSync(path.join(directory, 'notes.json'), '{}');
  assert.throws(() => initialEditorSettings(emptyRoot, false, () => 0), /bundled screenshot backgrounds/i);
});
