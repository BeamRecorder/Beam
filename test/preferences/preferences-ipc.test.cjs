const assert = require('node:assert/strict');
const test = require('node:test');

const { registerPreferencesIpc } = require('../../electron/preferences/preferences-ipc.cjs');

function ipcMainWith(handlers) {
  return { handle: (channel, handler) => handlers.set(channel, handler) };
}

function windowWith(sent) {
  return { webContents: { send: (channel, id) => sent.push({ channel, id }) } };
}

function shortcutPreferences() {
  return {
    schemaVersion: 3,
    theme: 'light',
    appearance: {},
    recordingBar: { visibility: 'always' },
    recordingInteractions: { enabled: false, noticeDismissed: false },
    onboardingCompleted: true,
    alwaysOnTop: true,
    devices: {},
    shortcuts: {
      'hud.startStopRecording': { keys: 'Alt+Shift+R', scope: 'global', category: 'hud' },
      'editor.playPause': { keys: 'Space', scope: 'application', category: 'video-editor' },
      'teleprompter.toggleVisibility': { keys: 'Alt+Shift+T', scope: 'global', category: 'teleprompter' },
    },
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  };
}

function storeWith(preferences) {
  return {
    read: () => structuredClone(preferences),
    patch: (patch) => {
      const next = { ...preferences, ...patch };
      if (patch.shortcuts) next.shortcuts = { ...preferences.shortcuts, ...patch.shortcuts };
      return Object.assign(preferences, next);
    },
    write: (next) => Object.assign(preferences, next),
  };
}

function linuxSourceWith(active) {
  const calls = { register: [], cleanup: 0 };
  return {
    calls,
    register: async (preferences) => {
      calls.register.push(preferences.shortcuts['hud.startStopRecording'].keys);
      return active;
    },
    cleanup: async () => {
      calls.cleanup += 1;
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('an active Linux source owns registration instead of Electron globalShortcut', async () => {
  const handlers = new Map();
  const registered = [];
  const source = linuxSourceWith(true);
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: {
      register: (...args) => registered.push(args),
      unregisterAll: () => {},
    },
    store: storeWith(shortcutPreferences()),
    linuxShortcutSource: source,
  });
  await flush();

  assert.equal(source.calls.register.length, 1);
  assert.equal(registered.length, 0);
  await cleanup();
  assert.equal(source.calls.cleanup, 1);
});

test('fallback registers global entries and dispatches them to windows', async () => {
  const handlers = new Map();
  const sent = [];
  const registered = [];
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
    globalShortcut: {
      register: (keys, callback) => registered.push({ keys, callback }),
      unregisterAll: () => {},
    },
    store: storeWith(shortcutPreferences()),
    linuxShortcutSource: linuxSourceWith(false),
  });
  await flush();

  assert.deepEqual(registered.map(({ keys }) => keys).sort(), ['Alt+Shift+R', 'Alt+Shift+T'].sort());
  registered.forEach(({ callback }) => callback());
  assert.deepEqual(sent, [
    { channel: 'preferences:shortcut', id: 'hud.startStopRecording' },
    { channel: 'preferences:shortcut', id: 'teleprompter.toggleVisibility' },
  ]);
  await cleanup();
});

test('preference updates serialize registration and use newest shortcuts', async () => {
  const handlers = new Map();
  const registered = [];
  const preferences = shortcutPreferences();
  const source = linuxSourceWith(false);
  registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: {
      register: (keys, callback) => registered.push({ keys, callback }),
      unregisterAll: () => {},
    },
    store: storeWith(preferences),
    linuxShortcutSource: source,
  });
  await flush();

  const update = handlers.get('preferences:update');
  const result = await update(null, {
    shortcuts: { 'hud.startStopRecording': { keys: 'Alt+Shift+Q', scope: 'global', category: 'hud' } },
  });
  assert.equal(result.shortcuts['hud.startStopRecording'].keys, 'Alt+Shift+Q');
  assert.equal(source.calls.register.at(-1), 'Alt+Shift+Q');
  assert.equal(registered.at(-2).keys, 'Alt+Shift+Q');
});

test('shortcut handler receives every global id when provided', async () => {
  const handlers = new Map();
  const received = [];
  registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: {
      register: (_keys, callback) => received.push(callback),
      unregisterAll: () => {},
    },
    store: storeWith(shortcutPreferences()),
    shortcutHandler: (id) => received.push(id),
  });
  await flush();

  const callbacks = received.splice(0);
  callbacks.forEach((callback) => callback());
  assert.deepEqual(received, ['hud.startStopRecording', 'teleprompter.toggleVisibility']);
});
