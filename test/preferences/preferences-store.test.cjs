const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore, defaults, normalize } = require('../../electron/preferences/preferences-store.cjs');

test('writes durable generic preferences and merges patches', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const store = createPreferencesStore(directory);
  const saved = store.patch({
    theme: 'dark',
    shortcuts: { 'hud.startStopRecording': { keys: 'Ctrl+Shift+R', scope: 'global', category: 'hud' } },
    extras: { futureFlag: true },
  });
  assert.equal(saved.theme, 'dark');
  assert.equal(saved.shortcuts['hud.startStopRecording'].keys, 'Ctrl+Shift+R');
  assert.equal(saved.extras.futureFlag, true);
  assert.deepEqual(store.read(), saved);
  assert.ok(fs.existsSync(path.join(directory, 'preferencesSettings.json')));
});

test('rejects duplicate global shortcuts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const store = createPreferencesStore(directory);
  assert.throws(
    () =>
      store.write({
        ...store.read(),
        shortcuts: {
          a: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
          b: { keys: 'Ctrl+F', scope: 'global', category: 'hud' },
        },
      }),
    /dupliqué/,
  );
});

test('accepts hover-only recorder visibility and falls back for invalid values', () => {
  assert.equal(normalize({ recordingBar: { visibility: 'hover-only' } }).recordingBar.visibility, 'hover-only');
  assert.equal(normalize({ recordingBar: { visibility: 'not-a-mode' } }, 'win32').recordingBar.visibility, 'always');
  assert.equal(normalize({ recordingBar: { visibility: 'not-a-mode' } }, 'linux').recordingBar.visibility, 'hover-only');
});

test('uses hover-only defaults on Linux and always-visible defaults on desktop platforms', () => {
  assert.equal(defaults('linux').recordingBar.visibility, 'hover-only');
  assert.equal(defaults('win32').recordingBar.visibility, 'always');
  assert.equal(defaults('darwin').recordingBar.visibility, 'always');
  assert.equal(normalize({}, 'linux').recordingBar.visibility, 'hover-only');
  assert.equal(normalize({}, 'win32').recordingBar.visibility, 'always');
  assert.equal(normalize({}, 'darwin').recordingBar.visibility, 'always');
});

test('preserves an explicit recorder visibility preference on Linux', () => {
  for (const visibility of ['always', 'auto-fade', 'hover-only']) {
    assert.equal(normalize({ recordingBar: { visibility } }, 'linux').recordingBar.visibility, visibility);
  }
});

test('applies the injected platform default to missing and corrupt preference files', () => {
  const linuxStore = createPreferencesStore(fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-linux-')), {
    platform: 'linux',
  });
  assert.equal(linuxStore.read().recordingBar.visibility, 'hover-only');

  const macStore = createPreferencesStore(fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-mac-')), {
    platform: 'darwin',
  });
  assert.equal(macStore.read().recordingBar.visibility, 'always');

  const preserved = linuxStore.patch({ recordingBar: { visibility: 'always' } });
  assert.equal(preserved.recordingBar.visibility, 'always');
  assert.equal(linuxStore.patch({ theme: 'dark' }).recordingBar.visibility, 'always');

  fs.writeFileSync(linuxStore.file, '{broken');
  assert.equal(linuxStore.read().recordingBar.visibility, 'hover-only');
});

test('migrates interaction recording preferences and validates booleans', () => {
  const migrated = normalize({ schemaVersion: 2, theme: 'dark' });
  assert.equal(migrated.schemaVersion, 3);
  assert.deepEqual(migrated.recordingInteractions, { enabled: false, noticeDismissed: false });

  const normalized = normalize({
    recordingInteractions: { enabled: true, noticeDismissed: true },
  });
  assert.deepEqual(normalized.recordingInteractions, { enabled: true, noticeDismissed: true });
  assert.deepEqual(
    normalize({ recordingInteractions: { enabled: 'yes', noticeDismissed: 1 } }).recordingInteractions,
    { enabled: false, noticeDismissed: false },
  );
});

test('merges interaction preference patches without erasing sibling state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-preferences-'));
  const store = createPreferencesStore(directory);
  store.patch({ recordingInteractions: { noticeDismissed: true } });
  const saved = store.patch({ recordingInteractions: { enabled: true } });
  assert.deepEqual(saved.recordingInteractions, { enabled: true, noticeDismissed: true });
});
