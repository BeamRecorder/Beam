const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore, normalize } = require('../../electron/preferences/preferences-store.cjs');

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
  assert.equal(normalize({ recordingBar: { visibility: 'not-a-mode' } }).recordingBar.visibility, 'always');
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
