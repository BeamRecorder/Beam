const assert = require('node:assert/strict');
const test = require('node:test');
const { registerTeleprompterIpc } = require('../electron/teleprompter/teleprompter-ipc.cjs');

function createIpcFixture() {
  const listeners = new Map();
  const handlers = new Map();
  const calls = [];
  const owner = { name: 'HUD renderer' };
  const other = { name: 'editor renderer' };
  const snapshot = { document: { text: 'saved' } };
  const ipcMain = {
    on: (channel, callback) => listeners.set(channel, callback),
    handle: (channel, callback) => handlers.set(channel, callback),
  };
  const teleprompterWindow = {
    show: () => calls.push(['show']),
    hide: () => calls.push(['hide']),
    toggle: () => calls.push(['toggle']),
    setSession: (context) => calls.push(['setSession', context]),
    markRendererReady: (sender) => (calls.push(['markRendererReady', sender]), sender === owner),
    resumeState: (sender) => (calls.push(['resumeState', sender]), sender === owner ? snapshot : null),
    acknowledgeSuspend: (sender, id, state) => calls.push(['acknowledgeSuspend', sender, id, state]),
  };
  const storage = { save: () => null, get: () => null };

  registerTeleprompterIpc(ipcMain, teleprompterWindow, storage, () => owner);
  return { listeners, handlers, calls, owner, other, snapshot };
}

test('accepts teleprompter session changes only from the HUD owner', () => {
  const fixture = createIpcFixture();
  const context = { projectId: 'project', sessionId: 'session' };
  const setSession = fixture.listeners.get('teleprompter:set-session');

  setSession({ sender: fixture.other }, context);
  assert.deepEqual(fixture.calls, [], 'another renderer cannot replace or clear the current session');

  setSession({ sender: fixture.owner }, context);
  setSession({ sender: fixture.owner }, null);
  assert.deepEqual(fixture.calls, [
    ['setSession', context],
    ['setSession', null],
  ]);
});

test('forwards renderer ownership for readiness and resume-state requests', async () => {
  const fixture = createIpcFixture();
  const ready = fixture.listeners.get('teleprompter:ready');
  const resume = fixture.handlers.get('teleprompter:resume-state');

  assert.equal(ready({ sender: fixture.owner }), true);
  assert.equal(ready({ sender: fixture.other }), false);
  assert.equal(await resume({ sender: fixture.owner }), fixture.snapshot);
  assert.equal(await resume({ sender: fixture.other }), null);
  assert.deepEqual(fixture.calls, [
    ['markRendererReady', fixture.owner],
    ['markRendererReady', fixture.other],
    ['resumeState', fixture.owner],
    ['resumeState', fixture.other],
  ]);
});

test('forwards suspend acknowledgements with their original sender, id, and state', () => {
  const fixture = createIpcFixture();
  const id = 'checkpoint-1';
  const state = { document: { text: 'draft' } };

  fixture.listeners.get('teleprompter:suspended')({ sender: fixture.owner }, id, state);
  fixture.listeners.get('teleprompter:suspended')({ sender: fixture.other }, id, state);

  assert.deepEqual(fixture.calls, [
    ['acknowledgeSuspend', fixture.owner, id, state],
    ['acknowledgeSuspend', fixture.other, id, state],
  ]);
});
