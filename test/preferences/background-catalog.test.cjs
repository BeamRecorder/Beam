const assert = require('node:assert/strict');
const test = require('node:test');
const { backgroundCatalogPatch: patch } = require('../../apps/desktop/electron/preferences/background-catalog.cjs');
const { registerPreferencesIpc } = require('../../apps/desktop/electron/preferences/preferences-ipc.cjs');
const state = (extras = {}) => ({
  extras: { unrelated: { theme: 'dark' }, ...extras },
  backgroundPresets: { colors: ['#abcdef'], gradients: [] },
});
const apply = (preferences, operation, id) => ({ ...preferences, ...patch(preferences, { operation, id }) });

test('removes every preset kind while retaining sources, stable identities and unrelated settings', () => {
  for (const id of [
    'color:#abcdef',
    'color:custom:#ffffff',
    'gradient:violet',
    'gradient:custom:0',
    'user-wallpaper:image:abc.png',
    'user-wallpaper:video:abc.mp4',
  ]) {
    const original = state();
    const snapshot = structuredClone(original);
    const next = apply(original, 'remove', id);
    assert.deepEqual(original, snapshot);
    assert.deepEqual(next.backgroundPresets, snapshot.backgroundPresets);
    assert.deepEqual(next.extras.unrelated, snapshot.extras.unrelated);
    assert.deepEqual(next.extras.hiddenBackgroundIds, [id]);
    assert.deepEqual(next.extras.backgroundCatalogHistory, { version: 1, id, deleted: true });
  }
});

test('keeps one persisted receipt, supports undo/redo after reload, and keeps earlier deletions', () => {
  let preferences = apply(state(), 'remove', 'color:#abcdef');
  preferences = apply(preferences, 'remove', 'gradient:custom:0');
  preferences = JSON.parse(JSON.stringify(preferences));
  preferences = apply(preferences, 'undo', 'gradient:custom:0');
  assert.deepEqual(preferences.extras.hiddenBackgroundIds, ['color:#abcdef']);
  assert.equal(preferences.extras.backgroundCatalogHistory.deleted, false);
  preferences = apply(preferences, 'redo', 'gradient:custom:0');
  assert.deepEqual(preferences.extras.hiddenBackgroundIds, ['color:#abcdef', 'gradient:custom:0']);
  assert.equal(preferences.extras.backgroundCatalogHistory.deleted, true);
  const duplicate = apply(preferences, 'remove', 'color:#abcdef');
  assert.deepEqual(duplicate.extras.backgroundCatalogHistory, preferences.extras.backgroundCatalogHistory);
});

test('restores a newly saved hidden color without clearing another receipt', () => {
  let preferences = apply(state(), 'remove', 'color:#abcdef');
  preferences = apply(preferences, 'restore', 'color:#abcdef');
  assert.deepEqual(preferences.extras.hiddenBackgroundIds, []);
  assert.equal(preferences.extras.backgroundCatalogHistory.deleted, false);
  preferences = apply(preferences, 'remove', 'gradient:violet');
  const next = apply(preferences, 'restore', 'color:#ffffff');
  assert.deepEqual(next.extras.backgroundCatalogHistory, preferences.extras.backgroundCatalogHistory);
  assert.deepEqual(apply(state(), 'restore', 'color:#ffffff').extras.backgroundCatalogHistory, null);
});

test('rejects invalid identities, builtin media, operations, traversal and stale undo receipts', () => {
  for (const id of [
    null,
    '',
    'image:builtin',
    'user-wallpaper:image:../secret.png',
    'user-wallpaper:video:a\\b',
    'color:custom:bad',
    'gradient:' + 'a'.repeat(513),
  ])
    assert.throws(() => apply(state(), 'remove', id), /identity/);
  for (const request of [null, {}, { operation: 'wipe' }]) assert.throws(() => patch(state(), request), /operation/);
  assert.throws(() => apply(state(), 'undo', 'color:#abcdef'), /history/);
  const next = apply(state(), 'remove', 'color:#abcdef');
  assert.throws(() => apply(next, 'undo', 'color:#ffffff'), /history/);
});

test('sanitizes malformed preferences and bounds deletion metadata', () => {
  const malformed = [
    null,
    { version: 2, id: 'color:#ffffff', deleted: true },
    { version: 1, id: 'invalid', deleted: true },
    { version: 1, id: 'color:#ffffff', deleted: 'yes' },
  ];
  for (const history of malformed) {
    const next = apply(
      state({ hiddenBackgroundIds: ['invalid', null, 'color:#abcdef'], backgroundCatalogHistory: history }),
      'restore',
      'color:#ffffff',
    );
    assert.equal(next.extras.backgroundCatalogHistory, null);
    assert.deepEqual(next.extras.hiddenBackgroundIds, ['color:#abcdef']);
  }
  const next = apply({ ...state(), extras: undefined }, 'remove', 'color:#ffffff');
  assert.deepEqual(next.extras.hiddenBackgroundIds, ['color:#ffffff']);
  const ids = Array.from({ length: 4096 }, (_, n) => `gradient:custom:${n}`);
  assert.throws(() => apply(state({ hiddenBackgroundIds: ids }), 'remove', 'gradient:new'), /limit/);
  assert.equal(apply(state({ hiddenBackgroundIds: ids }), 'remove', ids[0]).extras.hiddenBackgroundIds.length, 4096);
});

test('catalogue IPC serializes concurrent windows, broadcasts each state and rejects stale undo', async () => {
  let preferences = { ...state(), shortcuts: {} };
  const handlers = new Map();
  const published = [];
  const cleanup = registerPreferencesIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    BrowserWindow: {
      getAllWindows: () => [{ webContents: { send: (_name, value) => published.push(structuredClone(value)) } }],
    },
    globalShortcut: { unregisterAll() {}, register() {} },
    store: {
      read: () => structuredClone(preferences),
      patchBatch: ([value]) => {
        const previous = preferences;
        preferences = { ...preferences, extras: { ...preferences.extras, ...value.extras } };
        return { previous, preferences };
      },
    },
  });
  const update = handlers.get('preferences:background-catalog');
  await Promise.all([
    update(null, { operation: 'remove', id: 'color:#abcdef' }),
    update(null, { operation: 'remove', id: 'gradient:violet' }),
  ]);
  assert.deepEqual(preferences.extras.hiddenBackgroundIds, ['color:#abcdef', 'gradient:violet']);
  assert.equal(published.length, 2);
  assert.throws(() => update(null, { operation: 'undo', id: 'color:#abcdef' }), /history/);
  await update(null, { operation: 'undo', id: 'gradient:violet' });
  assert.deepEqual(preferences.extras.hiddenBackgroundIds, ['color:#abcdef']);
  await cleanup();
});
