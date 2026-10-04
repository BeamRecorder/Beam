const assert = require('node:assert/strict');
const test = require('node:test');
const { createInputAccessPreferenceWriter } = require('../apps/desktop/electron/input/input-access-preferences.cjs');

test('existing enabled consent is not rewritten or broadcast', () => {
  const persist = createInputAccessPreferenceWriter({
    store: {
      read: () => ({ recordingInteractions: { enabled: true, noticeDismissed: true } }),
      patchBatch: () => assert.fail('must not rewrite saved consent'),
    },
    BrowserWindow: { getAllWindows: () => assert.fail('must not broadcast unchanged preferences') },
  });
  persist();
});

test('successful authorization completes partially saved consent and skips destroyed windows', () => {
  const patches = [];
  const preferences = { recordingInteractions: { enabled: true, noticeDismissed: true } };
  const persist = createInputAccessPreferenceWriter({
    store: {
      read: () => ({ recordingInteractions: { enabled: true, noticeDismissed: false } }),
      patchBatch: (patch) => {
        patches.push(patch);
        return { preferences };
      },
    },
    BrowserWindow: {
      getAllWindows: () => [{ isDestroyed: () => true, webContents: { send: () => assert.fail('destroyed window') } }],
    },
  });
  persist();
  assert.deepEqual(patches, [[{ recordingInteractions: { enabled: true, noticeDismissed: true } }]]);
});

test('a preference write failure does not broadcast a choice that was not saved', () => {
  const persist = createInputAccessPreferenceWriter({
    store: {
      read: () => ({ recordingInteractions: { enabled: false, noticeDismissed: true } }),
      patchBatch: () => {
        throw new Error('disk full');
      },
    },
    BrowserWindow: { getAllWindows: () => assert.fail('must not broadcast failed writes') },
  });
  assert.throws(persist, /disk full/);
});
