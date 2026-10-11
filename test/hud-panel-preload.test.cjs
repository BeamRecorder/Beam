const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require.resolve('../apps/desktop/electron/preload.cjs'), 'utf8');
function preload(argv = []) {
  let api;
  const invoked = [],
    sent = [],
    listeners = new Map();
  vm.runInNewContext(source, {
    process: { platform: 'linux', argv },
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (_, value) => {
          api = value;
        },
      },
      webUtils: {},
      ipcRenderer: {
        send: (...args) => sent.push(args),
        invoke: async (...args) => {
          invoked.push(args);
          return true;
        },
        on: (name, callback) => listeners.set(name, callback),
        removeListener: (name, callback) => {
          if (listeners.get(name) === callback) listeners.delete(name);
        },
      },
    }),
  });
  return { api, sent, invoked, listeners };
}
test('the settings preload trusts only the installed marker supplied by its native owner', () => {
  assert.equal(preload(['--beam-installed']).api.canLaunchAtStartup, true);
  assert.equal(preload(['--beam-dev-crossplatform']).api.canLaunchAtStartup, false);
  assert.equal(preload().api.canLaunchAtStartup, false);
  assert.equal(Object.isFrozen(preload().api), true);
});
test('shell and content readiness use separate named IPC signals', () => {
  const f = preload();
  f.api.notifyHudPanelPrepared();
  f.api.notifyHudPanelReady();
  assert.deepEqual(f.sent, [['hud-panel:prepared'], ['hud-panel:ready']]);
});
test('panel visibility subscriptions pass booleans and release their own listener', () => {
  const f = preload(),
    values = [],
    dispose = f.api.onHudPanelVisibility((value) => values.push(value));
  f.listeners.get('hud-panel:visibility')({}, true);
  f.listeners.get('hud-panel:visibility')({}, false);
  assert.deepEqual(values, [true, false]);
  dispose();
  assert.equal(f.listeners.has('hud-panel:visibility'), false);
});

test('native window visibility subscribes before requesting its initial snapshot and cleans up', () => {
  const f = preload();
  const values = [];
  const dispose = f.api.onWindowVisibility((value) => values.push(value));
  assert.deepEqual(f.sent, [['window:observe-visibility']]);
  f.listeners.get('window:visibility')({}, false);
  f.listeners.get('window:visibility')({}, true);
  assert.deepEqual(values, [false, true]);
  dispose();
  assert.equal(f.listeners.has('window:visibility'), false);
});

test('Settings exposes only the named capture and editor context requests', async () => {
  const f = preload();
  await f.api.setShortcutCaptureActive(true);
  await f.api.setShortcutCaptureActive(false);
  await f.api.getSettingsEditorContext();
  await f.api.runSettingsEditorAction('recorder');
  assert.deepEqual(f.invoked, [
    ['settings:shortcut-capture', true],
    ['settings:shortcut-capture', false],
    ['settings:editor-context'],
    ['settings:editor-action', 'recorder'],
  ]);
});
test('editor action subscriptions validate requests, acknowledge completion and dispose', async () => {
  const f = preload(),
    actions = [];
  const dispose = f.api.onSettingsEditorAction((action) => actions.push(action));
  const callback = f.listeners.get('settings:editor-action');
  for (const value of [null, {}, { id: 1.1, action: 'recorder' }, { id: 1, action: 'unknown' }]) callback({}, value);
  for (const [index, action] of ['recorder', 'webcam', 'devtools'].entries()) callback({}, { id: index + 1, action });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(actions, ['recorder', 'webcam', 'devtools']);
  assert.deepEqual(
    JSON.parse(JSON.stringify(f.sent)),
    [1, 2, 3].map((id) => ['settings:editor-action-result', { id }]),
  );
  dispose();
  assert.equal(f.listeners.has('settings:editor-action'), false);
});
test('editor action failures return bounded errors for synchronous and asynchronous failures', async () => {
  for (const asynchronous of [false, true]) {
    const f = preload();
    f.api.onSettingsEditorAction(() => {
      const error = new Error('x'.repeat(3000));
      if (asynchronous) return Promise.reject(error);
      throw error;
    });
    f.listeners.get('settings:editor-action')({}, { id: 7, action: 'webcam' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.sent[0][0], 'settings:editor-action-result');
    assert.equal(f.sent[0][1].id, 7);
    assert.equal(f.sent[0][1].error.length, 2048);
  }
});
