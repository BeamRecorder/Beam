const assert = require('node:assert/strict');
const test = require('node:test');
const { createShortcutDispatcher } = require('../apps/desktop/electron/lifecycle/shortcut-dispatcher.cjs');
function fixture(options = {}) {
  const calls = [],
    pending = [];
  const dispatcher = createShortcutDispatcher({
    BrowserWindow: { getAllWindows: () => [{ webContents: { send: (...args) => calls.push(args) } }] },
    preferencesStore: {
      read: () => ({ shortcuts: { 'hud.start': { scope: 'global' }, 'editor.play': { scope: 'app' } } }),
    },
    teleprompterWindow: {
      handleShortcut: (id) => {
        calls.push(['teleprompter', id]);
        return true;
      },
    },
    getTray: () => ({
      dispatchHudShortcut: (id) => {
        if (options.sleeping) {
          calls.push(['wake', id]);
          return true;
        }
        return false;
      },
    }),
    getQuickSnip: () => ({
      toggle: async () => {
        calls.push(['quick']);
      },
    }),
    getRegionOverlay: () => ({
      handleShortcut: (id) => {
        if (options.selecting && id === 'hud.startStopRecording') {
          calls.push(['region', id]);
          return true;
        }
        return false;
      },
    }),
    isReady: () => options.ready !== false,
    pending,
  });
  return { dispatcher, calls, pending };
}
test('wakes a suspended HUD instead of broadcasting to its unloaded document', () => {
  const f = fixture({ sleeping: true });
  assert.equal(f.dispatcher.dispatch('hud.start'), true);
  assert.deepEqual(f.calls, [['wake', 'hud.start']]);
});
test('the active region selector owns Start/Stop before tray wake or broadcast', () => {
  const f = fixture({ sleeping: true, selecting: true });
  assert.equal(f.dispatcher.dispatch('hud.startStopRecording'), true);
  assert.deepEqual(f.calls, [['region', 'hud.startStopRecording']]);
});
test('region selection leaves unrelated actions and idle recording shortcuts with their existing owners', () => {
  const f = fixture({ selecting: true });
  f.dispatcher.dispatch('editor.play');
  assert.deepEqual(f.calls, [['preferences:shortcut', 'editor.play']]);
  const idle = fixture();
  idle.dispatcher.dispatch('hud.startStopRecording');
  assert.deepEqual(idle.calls, [['preferences:shortcut', 'hud.startStopRecording']]);
});
test('dispatches Quick Snip directly without waking the HUD', () => {
  const f = fixture({ sleeping: true });
  f.dispatcher.dispatch('quickSnip.toggle');
  assert.deepEqual(f.calls, [['quick']]);
});
test('routes teleprompter actions to its native owner and ordinary actions to existing windows', () => {
  const f = fixture();
  f.dispatcher.dispatch('teleprompter.play');
  f.dispatcher.dispatch('editor.play');
  assert.deepEqual(f.calls, [
    ['teleprompter', 'teleprompter.play'],
    ['preferences:shortcut', 'editor.play'],
  ]);
});
test('queues external shortcuts until startup and rejects app-scoped or unknown actions', () => {
  const f = fixture({ ready: false });
  assert.equal(f.dispatcher.external('hud.start'), false);
  assert.deepEqual(f.pending, ['hud.start']);
  assert.deepEqual(f.calls, []);
  const ready = fixture();
  assert.equal(ready.dispatcher.external('editor.play'), false);
  assert.equal(ready.dispatcher.external('missing'), false);
  assert.equal(ready.dispatcher.external('hud.start'), true);
  assert.deepEqual(ready.calls, [['preferences:shortcut', 'hud.start']]);
});
