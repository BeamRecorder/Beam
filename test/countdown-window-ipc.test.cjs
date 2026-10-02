const assert = require('node:assert/strict');
const test = require('node:test');
const { registerCaptureWindowIpc } = require('../apps/desktop/electron/lifecycle/capture-window-ipc.cjs');

function harness() {
  const events = new Map();
  const handlers = new Map();
  const calls = [];
  const sender = {};
  registerCaptureWindowIpc({
    applicationIpc: {
      on: (name, callback) => events.set(name, callback),
      handle: (name, callback) => handlers.set(name, callback),
    },
    BrowserWindow: {},
    cameraOverlay: {},
    countdownOverlay: {
      show: (...args) => calls.push(['show', ...args]),
      cancel: (...args) => calls.push(['cancel', ...args]),
      setInteractive: (...args) => calls.push(['interactive', ...args]),
      markRendererReady: (...args) => calls.push(['ready', ...args]),
    },
    screenRegionOverlay: {},
    teleprompterWindow: {},
  });
  return { events, handlers, calls, sender };
}

test('countdown IPC preserves the requesting owner and normalizes invalid values to hidden', () => {
  const { handlers, calls, sender } = harness();
  for (const value of [3, 0, -1, null, 1.5, '3', NaN]) handlers.get('countdown:set')({ sender }, value);
  assert.deepEqual(
    calls,
    [3, null, null, null, null, null, null].map((value) => ['show', value, sender]),
  );
});
test('countdown cancellation delegates the exact sender for native owner validation', () => {
  const { events, calls, sender } = harness();
  events.get('countdown:cancel')({ sender });
  assert.deepEqual(calls, [['cancel', sender]]);
});
test('countdown readiness and mouse handling delegate sender and value without trusting the renderer', () => {
  const { events, calls, sender } = harness();
  events.get('countdown:ready')({ sender });
  events.get('countdown:interactive')({ sender }, true);
  events.get('countdown:interactive')({ sender }, 'invalid');
  assert.deepEqual(calls, [
    ['ready', sender],
    ['interactive', sender, true],
    ['interactive', sender, 'invalid'],
  ]);
});
