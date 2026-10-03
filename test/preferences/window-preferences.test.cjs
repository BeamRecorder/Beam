const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { applyHudWindowPreferences } = require('../../apps/desktop/electron/preferences/window-preferences.cjs');
const { registerPreferencesIpc } = require('../../apps/desktop/electron/preferences/preferences-ipc.cjs');
const { WindowController } = require('../../apps/desktop/electron/window/window-controller.cjs');
const { EditorWindowController } = require('../../apps/desktop/electron/window/editor-window-controller.cjs');

function fixture(platform = 'linux') {
  const hud = Object.assign(new EventEmitter(), {
    visible: true,
    minimized: false,
    topmostCalls: [],
    isDestroyed: () => false,
    isVisible: () => hud.visible,
    isMinimized: () => hud.minimized,
    setIgnoreMouseEvents: () => {},
    setAlwaysOnTop: (value, level) => hud.topmostCalls.push([value, level]),
  });
  const hudController = new WindowController(hud, { screenModule: {}, platform });
  hudController.ready = true;
  hudController.applyZOrderPolicy();
  const editor = {};
  const editorController = new EditorWindowController(editor, () => {});
  const panel = {};
  const controllers = new WeakMap([
    [hud, hudController],
    [editor, editorController],
  ]);
  const windows = [editor, panel, hud];
  const apply = (alwaysOnTop) => applyHudWindowPreferences({ windows, controllers, preferences: { alwaysOnTop } });
  return { hud, hudController, windows, controllers, apply };
}

for (const platform of ['linux', 'win32', 'darwin']) {
  test(`${platform}: applies HUD topmost preferences with editor and unregistered windows open`, () => {
    const { hud, hudController, apply } = fixture(platform);
    assert.doesNotThrow(() => apply(false));
    assert.equal(hudController.hudAlwaysOnTop, false);
    assert.deepEqual(hud.topmostCalls.at(-1), [false, undefined]);
    apply(true);
    assert.deepEqual(hud.topmostCalls.at(-1), [true, platform === 'win32' ? 'screen-saver' : undefined]);
    const count = hud.topmostCalls.length;
    apply(true);
    assert.equal(hud.topmostCalls.length, count);
  });
}

test('hidden and minimized HUDs remain demoted across preference updates', () => {
  const { hud, hudController, apply } = fixture();
  hud.visible = false;
  hudController.hiddenByController = true;
  apply(false);
  apply(true);
  assert.deepEqual(hud.topmostCalls.at(-1), [false, undefined]);
  hud.visible = true;
  hudController.hiddenByController = false;
  hud.minimized = true;
  apply(false);
  apply(true);
  assert.deepEqual(hud.topmostCalls.at(-1), [false, undefined]);
  hud.minimized = false;
  hudController.applyZOrderPolicy();
  assert.deepEqual(hud.topmostCalls.at(-1), [true, undefined]);
});

test('recording controls remain topmost when the HUD preference is disabled', () => {
  const { hud, hudController, apply } = fixture();
  hudController.mode = 'recorder';
  apply(false);
  assert.equal(hudController.hudAlwaysOnTop, false);
  assert.deepEqual(hud.topmostCalls.at(-1), [true, undefined]);
});

test('an empty registry does not apply native window operations', () => {
  assert.doesNotThrow(() => applyHudWindowPreferences({ windows: [], controllers: new WeakMap(), preferences: {} }));
});

test('single, batch and reset preference IPC resolve while editors are registered', async () => {
  const { hud, windows, controllers } = fixture();
  const handlers = new Map();
  let preferences = { alwaysOnTop: true, shortcuts: {}, theme: 'light' };
  const sent = [];
  for (const window of windows) window.webContents = { send: (channel, value) => sent.push([channel, value]) };
  const cleanup = registerPreferencesIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    BrowserWindow: { getAllWindows: () => windows },
    globalShortcut: { register: () => {}, unregisterAll: () => {} },
    store: {
      read: () => preferences,
      patchBatch: (patches) => {
        const previous = preferences;
        preferences = Object.assign({}, preferences, ...patches);
        return { previous, preferences };
      },
      write: (value) => (preferences = value),
    },
    onPreferencesChanged: (value) => applyHudWindowPreferences({ windows, controllers, preferences: value }),
  });
  try {
    const single = await handlers.get('preferences:update')(null, { alwaysOnTop: false });
    assert.equal(single.alwaysOnTop, false);
    assert.deepEqual(hud.topmostCalls.at(-1), [false, undefined]);
    const batch = await handlers.get('preferences:update-batch')(null, [{ alwaysOnTop: true }, { theme: 'dark' }]);
    assert.equal(batch.theme, 'dark');
    assert.deepEqual(hud.topmostCalls.at(-1), [true, undefined]);
    const reset = await handlers.get('preferences:reset')(null, ['alwaysOnTop']);
    assert.equal(reset.alwaysOnTop, true);
    assert.equal(sent.length, windows.length * 3);
  } finally {
    await cleanup();
  }
});
