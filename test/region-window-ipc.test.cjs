const assert = require('node:assert/strict');
const test = require('node:test');
const { registerCaptureWindowIpc } = require('../apps/desktop/electron/lifecycle/capture-window-ipc.cjs');
function harness() {
  const events = new Map();
  const handlers = new Map();
  const calls = [];
  const owner = {};
  const stranger = {};
  registerCaptureWindowIpc({
    applicationIpc: {
      on: (channel, callback) => events.set(channel, callback),
      handle: (channel, callback) => handlers.set(channel, callback),
    },
    BrowserWindow: { getAllWindows: () => [] },
    cameraOverlay: {},
    countdownOverlay: {},
    screenRegionOverlay: {
      nativeWindow: () => ({ webContents: owner }),
      confirm: (...args) => calls.push(['confirm', ...args]),
      update: (...args) => calls.push(['update', ...args]),
      cancel: () => calls.push(['cancel']),
      markMarkerReady: (sender) => calls.push(['marker', sender]),
      markPreviewReady: (...args) => calls.push(['preview', ...args]),
    },
    teleprompterWindow: {
      toggleForRegion: (options) => {
        calls.push(['toggle', options]);
        return true;
      },
      updateRegionConstraint: (options) => calls.push(['constraint', options]),
    },
  });
  return { events, handlers, calls, owner, stranger };
}
test('only the owning selector can confirm, update or cancel its region', () => {
  const { events, calls, owner, stranger } = harness();
  for (const sender of [stranger, owner]) {
    events.get('screen-region:confirm')({ sender }, 'crop', 'settings');
    events.get('screen-region:update')({ sender }, 'crop');
    events.get('screen-region:cancel')({ sender });
  }
  assert.deepEqual(calls, [['confirm', 'crop', 'settings'], ['update', 'crop'], ['cancel']]);
});
test('teleprompter calls validate the sending window before changing native placement', () => {
  const { handlers, calls, owner, stranger } = harness();
  for (const channel of ['screen-region:teleprompter', 'screen-region:teleprompter-region'])
    assert.throws(() => handlers.get(channel)({ sender: stranger }, {}), /Only the region selector/);
  assert.equal(handlers.get('screen-region:teleprompter')({ sender: owner }, 'bounds'), true);
  handlers.get('screen-region:teleprompter-region')({ sender: owner }, 'bounds');
  assert.deepEqual(calls, [
    ['toggle', 'bounds'],
    ['constraint', 'bounds'],
  ]);
});
test('marker readiness passes the exact native sender to its owning marker service', () => {
  const { events, calls, owner } = harness();
  events.get('screen-region:marker-ready')({ sender: owner });
  assert.deepEqual(calls, [['marker', owner]]);
});
test('preview readiness preserves the sender, generation and decoding result for owner validation', () => {
  const { events, calls, owner } = harness();
  events.get('screen-region:preview-ready')({ sender: owner }, 17, false);
  assert.deepEqual(calls, [['preview', owner, 17, false]]);
});
test('the preload exposes only the named preview readiness signal with the exact generation and result', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  let api;
  const sent = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../apps/desktop/electron/preload.cjs'), 'utf8'), {
    process: { platform: 'win32', argv: [] },
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (_name, value) => {
          api = value;
        },
      },
      webUtils: {},
      ipcRenderer: { send: (...args) => sent.push(args) },
    }),
  });
  api.notifyScreenRegionPreviewReady(8, true);
  api.notifyScreenRegionPreviewReady(9, false);
  assert.deepEqual(sent, [
    ['screen-region:preview-ready', 8, true],
    ['screen-region:preview-ready', 9, false],
  ]);
  assert.equal(Object.isFrozen(api), true);
});
