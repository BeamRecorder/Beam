const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { registerHudCloseBehavior } = require('../apps/desktop/electron/lifecycle/hud-close-behavior.cjs');

function fixture() {
  const window = new EventEmitter();
  const calls = [];
  const state = { minimizeToTray: false, hasTray: true, accepting: true };
  const dispose = registerHudCloseBehavior({
    window,
    controller: { setVisible: (visible) => calls.push(['visible', visible]) },
    preferencesStore: { read: () => ({ minimizeToTray: state.minimizeToTray }) },
    coordinator: { canAcceptWork: () => state.accepting },
    hasTray: () => state.hasTray,
    requestQuit: () => calls.push(['quit']),
  });
  const close = () => window.emit('close', { preventDefault: () => calls.push(['prevent']) });
  return { window, calls, state, close, dispose };
}

test('closing requests coordinated quit unless the saved choice explicitly enables tray hiding', () => {
  for (const value of [undefined, null, false, 0, 'true', {}]) {
    const f = fixture();
    f.state.minimizeToTray = value;
    f.close();
    assert.deepEqual(f.calls, [['prevent'], ['quit']]);
  }
});

test('enabled close hides the existing HUD through its controller without quitting', () => {
  const f = fixture();
  f.state.minimizeToTray = true;
  f.close();
  assert.deepEqual(f.calls, [['prevent'], ['visible', false]]);
});

test('reads the latest saved choice on each close without requiring a restart', () => {
  const f = fixture();
  f.state.minimizeToTray = true;
  f.close();
  f.state.minimizeToTray = false;
  f.close();
  assert.deepEqual(f.calls, [['prevent'], ['visible', false], ['prevent'], ['quit']]);
});

test('quits instead of leaving Beam inaccessible when the native tray is unavailable', () => {
  const f = fixture();
  f.state.minimizeToTray = true;
  f.state.hasTray = false;
  f.close();
  assert.deepEqual(f.calls, [['prevent'], ['quit']]);
});

test('explicit quit, update restarts and shutdown may close the HUD without hiding or preventing close', () => {
  for (const enabled of [true, false]) {
    const f = fixture();
    f.state.minimizeToTray = enabled;
    f.state.accepting = false;
    f.close();
    assert.deepEqual(f.calls, []);
  }
});

test('disposal detaches only its own close listener and can be repeated safely', () => {
  const f = fixture();
  f.window.on('close', () => f.calls.push(['other listener']));
  f.dispose();
  f.dispose();
  f.close();
  assert.equal(f.window.listenerCount('close'), 1);
  assert.deepEqual(f.calls, [['other listener']]);
});
