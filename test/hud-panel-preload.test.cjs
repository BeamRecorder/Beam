const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require.resolve('../apps/desktop/electron/preload.cjs'), 'utf8');
function preload(argv = []) {
  let api;
  const sent = [],
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
        invoke: async () => true,
        on: (name, callback) => listeners.set(name, callback),
        removeListener: (name, callback) => {
          if (listeners.get(name) === callback) listeners.delete(name);
        },
      },
    }),
  });
  return { api, sent, listeners };
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
