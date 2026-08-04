const assert = require('node:assert/strict');
const test = require('node:test');
const { registerWhisperIpc } = require('../electron/captions/whisper-ipc.cjs');

test('Whisper IPC returns each model state and forwards progress only to the caller', async () => {
  const handlers = new Map();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
  const sent = [];
  const store = {
    models: ['tiny'],
    state: async (id) => ({ id, status: 'missing' }),
    download: async (id, notify) => {
      notify({ id, status: 'downloading', downloadedBytes: 3, totalBytes: 9 });
      return { id, status: 'ready' };
    },
  };
  registerWhisperIpc({ ipcMain, store });
  assert.deepEqual(await handlers.get('whisper:models')(), [{ id: 'tiny', status: 'missing' }]);
  assert.deepEqual(
    await handlers.get('whisper:download')({ sender: { send: (...value) => sent.push(value) } }, { modelId: 'tiny' }),
    { id: 'tiny', status: 'ready' },
  );
  assert.deepEqual(sent, [
    ['whisper:progress', { id: 'tiny', status: 'downloading', downloadedBytes: 3, totalBytes: 9 }],
  ]);
});
