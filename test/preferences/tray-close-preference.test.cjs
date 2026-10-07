const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore } = require('../../apps/desktop/electron/preferences/preferences-store.cjs');
const { registerPreferencesIpc } = require('../../apps/desktop/electron/preferences/preferences-ipc.cjs');
const { registerHudCloseBehavior } = require('../../apps/desktop/electron/lifecycle/hud-close-behavior.cjs');

for (const platform of ['linux', 'win32', 'darwin']) {
  test(`the ${platform} tray choice persists through IPC and controls the next Recorder close`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-tray-preference-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'preferences.json');
    const store = createPreferencesStore(file, { platform });
    const handlers = new Map();
    const notifications = [];
    const cleanup = registerPreferencesIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      BrowserWindow: {
        getAllWindows: () => [{ webContents: { send: (channel, value) => notifications.push([channel, value]) } }],
      },
      globalShortcut: { register() {}, unregisterAll() {} },
      store,
    });
    t.after(cleanup);
    const window = new EventEmitter();
    const actions = [];
    t.after(
      registerHudCloseBehavior({
        window,
        controller: { setVisible: (value) => actions.push(['visible', value]) },
        preferencesStore: store,
        coordinator: { canAcceptWork: () => true },
        hasTray: () => true,
        requestQuit: () => actions.push(['quit']),
      }),
    );
    for (const enabled of [true, false, true]) {
      const saved = await handlers.get('preferences:update')({}, { minimizeToTray: enabled });
      assert.equal(saved.minimizeToTray, enabled);
      assert.equal(handlers.get('preferences:get')().minimizeToTray, enabled);
      assert.equal(createPreferencesStore(file, { platform }).read().minimizeToTray, enabled);
      assert.equal(notifications.at(-1)[0], 'preferences:changed');
      assert.equal(notifications.at(-1)[1].minimizeToTray, enabled);
      window.emit('close', { preventDefault: () => actions.push(['prevent']) });
      assert.deepEqual(actions.splice(0), enabled ? [['prevent'], ['visible', false]] : [['prevent'], ['quit']]);
    }
  });
}
