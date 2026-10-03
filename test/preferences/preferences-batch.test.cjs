const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore } = require('../../apps/desktop/electron/preferences/preferences-store.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-preferences-batch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createPreferencesStore(path.join(root, 'preferences.json'));
  store.patch({ theme: 'light', extras: { retained: true } });
  return store;
}

test('merges all patches in memory, reads and writes once, and returns the previous snapshot', (t) => {
  const store = fixture(t);
  const read = fs.readFileSync;
  const write = fs.writeFileSync;
  let reads = 0;
  let writes = 0;
  fs.readFileSync = (...args) => {
    reads += 1;
    return read(...args);
  };
  fs.writeFileSync = (...args) => {
    writes += 1;
    return write(...args);
  };
  let result;
  try {
    result = store.patchBatch([
      { theme: 'dark' },
      { extras: { one: 1 }, recordingInteractions: { noticeDismissed: true } },
      {
        appearance: { theme: 'system' },
        extras: { two: 2 },
        recordingInteractions: { enabled: true },
      },
    ]);
  } finally {
    fs.readFileSync = read;
    fs.writeFileSync = write;
  }
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  assert.equal(result.previous.theme, 'light');
  assert.equal(result.previous.appearance.theme, 'light');
  assert.equal(result.preferences.theme, 'system');
  assert.equal(result.preferences.appearance.theme, 'system');
  assert.equal(result.preferences.extras.retained, true);
  assert.equal(result.preferences.extras.one, 1);
  assert.equal(result.preferences.extras.two, 2);
  assert.deepEqual(result.preferences.recordingInteractions, {
    enabled: true,
    noticeDismissed: true,
  });
  assert.deepEqual(store.read(), result.preferences);
});

test('validates the final batch, allowing shortcut swaps without intermediate conflicts', (t) => {
  const store = fixture(t);
  const previous = store.read().shortcuts;
  const first = 'hud.startStopRecording';
  const second = 'hud.playPause';
  const { preferences } = store.patchBatch([
    {
      shortcuts: {
        [first]: { ...previous[first], keys: previous[second].keys },
      },
    },
    {
      shortcuts: {
        [second]: { ...previous[second], keys: previous[first].keys },
      },
    },
  ]);
  assert.equal(preferences.shortcuts[first].keys, previous[second].keys);
  assert.equal(preferences.shortcuts[second].keys, previous[first].keys);
});

test('rejects invalid batches or a conflicting final shortcut map without changing the file', (t) => {
  const store = fixture(t);
  const original = fs.readFileSync(store.file, 'utf8');
  for (const invalid of [null, {}, [null], [1], [[]], [{ theme: 'dark' }, undefined]]) {
    assert.throws(() => store.patchBatch(invalid), TypeError);
    assert.equal(fs.readFileSync(store.file, 'utf8'), original);
  }
  assert.throws(
    () =>
      store.patchBatch([
        { theme: 'dark' },
        {
          shortcuts: {
            duplicate: {
              keys: 'Alt+Shift+R',
              scope: 'global',
              category: 'hud',
            },
          },
        },
      ]),
    /dupliqué/,
  );
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
});

test('empty batches preserve original bytes and never write', (t) => {
  const store = fixture(t);
  const original = fs.readFileSync(store.file, 'utf8');
  const write = fs.writeFileSync;
  fs.writeFileSync = () => assert.fail('empty batch must not write');
  let result;
  try {
    result = store.patchBatch([]);
  } finally {
    fs.writeFileSync = write;
  }
  assert.deepEqual(result.preferences, result.previous);
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
});

test('read and write failures preserve the original and leave no owned temporary files', (t) => {
  const store = fixture(t);
  const original = fs.readFileSync(store.file, 'utf8');
  const read = fs.readFileSync;
  const rename = fs.renameSync;
  fs.readFileSync = () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  };
  try {
    assert.throws(() => store.patchBatch([{ theme: 'dark' }]), /denied/);
  } finally {
    fs.readFileSync = read;
  }
  fs.renameSync = () => {
    throw new Error('rename failed');
  };
  try {
    assert.throws(() => store.patchBatch([{ theme: 'dark' }]), /rename failed/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(store.file, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(path.dirname(store.file)), ['preferences.json']);
});
