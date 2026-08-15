const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createShutdownAwareIpc } = require('../electron/lifecycle/shutdown-ipc.cjs');

test('new invoke and send IPC work is rejected as soon as shutdown begins', async () => {
  const handlers = new Map();
  const listeners = new Map();
  let accepting = true;
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
    on: (channel, listener) => listeners.set(channel, listener),
  };
  const gated = createShutdownAwareIpc(ipcMain, () => accepting);
  let sends = 0;
  gated.handle('record', async () => 'started');
  gated.on('window:create', () => {
    sends += 1;
  });

  assert.equal(await handlers.get('record')({}), 'started');
  listeners.get('window:create')({});
  assert.equal(sends, 1);
  accepting = false;
  await assert.rejects(
    async () => handlers.get('record')({}),
    (error) => error.code === 'application-shutting-down',
  );
  assert.equal(listeners.get('window:create')({}), false);
  assert.equal(sends, 1);
});
