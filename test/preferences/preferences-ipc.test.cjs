const assert = require('node:assert/strict');
const test = require('node:test');

const { registerPreferencesIpc } = require('../../apps/desktop/electron/preferences/preferences-ipc.cjs');

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
      'hud.startStopRecording': {
        keys: 'Alt+Shift+R',
        scope: 'global',
        category: 'hud',
      },
      'editor.playPause': {
        keys: 'Space',
        scope: 'application',
        category: 'video-editor',
      },
      'teleprompter.toggleVisibility': {
        keys: 'Alt+Shift+T',
        scope: 'global',
        category: 'teleprompter',
      },
    },
    directories: require('../../apps/desktop/electron/storage/directory-settings.cjs').normalizeDirectorySettings(),
    backgroundPresets: { colors: [], gradients: [] },
    extras: {},
  };
}

function storeWith(preferences) {
  const store = {
    read: () => structuredClone(preferences),
    patch: (patch) => {
      const next = { ...preferences, ...patch };
      if (patch.shortcuts) next.shortcuts = { ...preferences.shortcuts, ...patch.shortcuts };
      return Object.assign(preferences, next);
    },
    write: (next) => Object.assign(preferences, next),
  };
  store.patchBatch = (patches) => {
    const previous = structuredClone(preferences);
    for (const patch of patches) store.patch(patch);
    return { previous, preferences };
  };
  return store;
}

test('a batch publishes only its final settings and registers shortcuts once', async () => {
  const handlers = new Map();
  const sent = [];
  const changes = [];
  const source = linuxSourceWith({ fallbackIds: [] });
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
    globalShortcut: { register: () => {}, unregisterAll: () => {} },
    store: storeWith(shortcutPreferences()),
    linuxShortcutSource: source,
    onPreferencesChanged: (preferences) => changes.push(preferences),
  });
  await flush();
  const result = await handlers.get('preferences:update-batch')(null, [
    { theme: 'dark' },
    {
      shortcuts: {
        'hud.startStopRecording': {
          keys: 'Alt+Shift+Q',
          scope: 'global',
          category: 'hud',
        },
      },
    },
    {
      shortcuts: {
        'hud.startStopRecording': {
          keys: 'Alt+Shift+E',
          scope: 'global',
          category: 'hud',
        },
      },
    },
  ]);
  assert.equal(result.theme, 'dark');
  assert.equal(source.calls.register.length, 2);
  assert.equal(source.calls.register.at(-1), 'Alt+Shift+E');
  assert.deepEqual(sent, [{ channel: 'preferences:changed', id: result }]);
  assert.deepEqual(changes, [result]);
  await cleanup();
});

test('empty batches do not write, broadcast or apply window policy', async () => {
  const handlers = new Map();
  const sent = [];
  const store = storeWith(shortcutPreferences());
  store.patchBatch = () => assert.fail('empty batch should not write');
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
    globalShortcut: { register: () => {}, unregisterAll: () => {} },
    store,
    onPreferencesChanged: () => assert.fail('empty batch should not change policy'),
  });
  assert.deepEqual(await handlers.get('preferences:update-batch')(null, []), shortcutPreferences());
  assert.deepEqual(sent, []);
  await cleanup();
});

test('rejects invalid or oversized batches before storage and propagates persistence failure without broadcast', async () => {
  const handlers = new Map();
  const sent = [];
  const store = storeWith(shortcutPreferences());
  let writes = 0;
  store.patchBatch = () => {
    writes += 1;
    throw new Error('disk full');
  };
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
    globalShortcut: { register: () => {}, unregisterAll: () => {} },
    store,
  });
  const update = handlers.get('preferences:update-batch');
  for (const invalid of [null, {}, Array(65).fill({})]) await assert.rejects(update(null, invalid), TypeError);
  assert.equal(writes, 0);
  await assert.rejects(update(null, [{ theme: 'dark' }]), /disk full/);
  assert.equal(writes, 1);
  assert.deepEqual(sent, []);
  await cleanup();
});

function linuxSourceWith(result) {
  const calls = { register: [], cleanup: 0 };
  return {
    calls,
    register: async (preferences) => {
      calls.register.push(preferences.shortcuts['hud.startStopRecording'].keys);
      return result;
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
  const source = linuxSourceWith({
    gnomeIds: ['hud.startStopRecording', 'teleprompter.toggleVisibility'],
    fallbackIds: [],
  });
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

test('a Linux source owns convertible shortcuts while the rest fall back to globalShortcut', async () => {
  const handlers = new Map();
  const sent = [];
  const registered = [];
  const source = linuxSourceWith({
    gnomeIds: ['hud.startStopRecording'],
    fallbackIds: ['teleprompter.toggleVisibility'],
  });
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
    globalShortcut: {
      register: (keys, callback) => registered.push({ keys, callback }),
      unregisterAll: () => {},
    },
    store: storeWith(shortcutPreferences()),
    linuxShortcutSource: source,
  });
  await flush();

  assert.deepEqual(
    registered.map(({ keys }) => keys),
    ['Alt+Shift+T'],
  );
  registered.forEach(({ callback }) => callback());
  assert.deepEqual(sent, [{ channel: 'preferences:shortcut', id: 'teleprompter.toggleVisibility' }]);
  assert.equal(source.calls.cleanup, 0);
  await cleanup();
  assert.equal(source.calls.cleanup, 1);
});

test('a failed Linux registration cleans GNOME bindings and falls back entirely', async () => {
  const handlers = new Map();
  const registered = [];
  const source = linuxSourceWith(null);
  registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: {
      register: (keys, callback) => registered.push({ keys, callback }),
      unregisterAll: () => {},
    },
    store: storeWith(shortcutPreferences()),
    linuxShortcutSource: source,
  });
  await flush();

  assert.equal(source.calls.cleanup, 1);
  assert.deepEqual(registered.map(({ keys }) => keys).sort(), ['Alt+Shift+R', 'Alt+Shift+T'].sort());
});

test('preference updates serialize registration and use newest shortcuts', async () => {
  const handlers = new Map();
  const registered = [];
  const preferences = shortcutPreferences();
  const source = linuxSourceWith({
    gnomeIds: [],
    fallbackIds: ['hud.startStopRecording', 'teleprompter.toggleVisibility'],
  });
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
    shortcuts: {
      'hud.startStopRecording': {
        keys: 'Alt+Shift+Q',
        scope: 'global',
        category: 'hud',
      },
    },
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

test('ordinary updates and resets do not wait for or repeat shortcut registration', async () => {
  const handlers = new Map();
  const sent = [];
  const changes = [];
  let releaseRegistration;
  let registrations = 0;
  const initialRegistration = new Promise((resolve) => {
    releaseRegistration = resolve;
  });
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
    globalShortcut: { register: () => {}, unregisterAll: () => {} },
    store: storeWith(shortcutPreferences()),
    onPreferencesChanged: (preferences) => changes.push(preferences.theme),
    linuxShortcutSource: {
      register: async () => {
        registrations += 1;
        await initialRegistration;
        return { fallbackIds: [] };
      },
      cleanup: async () => {},
    },
  });
  await flush();
  const updated = await handlers.get('preferences:update')(null, {
    theme: 'dark',
  });
  assert.equal(updated.theme, 'dark');
  await handlers.get('preferences:reset')(null, ['theme']);
  await handlers.get('preferences:update')(null, {
    shortcuts: structuredClone(updated.shortcuts),
  });
  assert.equal(registrations, 1);
  assert.equal(sent.length, 3);
  assert.equal(changes.length, 3);
  releaseRegistration();
  await cleanup();
});

test('resetting changed shortcuts registers the restored bindings', async () => {
  const handlers = new Map();
  const source = linuxSourceWith({ fallbackIds: [] });
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: { register: () => {}, unregisterAll: () => {} },
    store: storeWith(shortcutPreferences()),
    linuxShortcutSource: source,
  });
  await flush();
  await handlers.get('preferences:update')(null, {
    shortcuts: {
      'hud.startStopRecording': {
        keys: 'Alt+Shift+Q',
        scope: 'global',
        category: 'hud',
      },
    },
  });
  const reset = await handlers.get('preferences:reset')(null, ['shortcuts']);
  assert.equal(source.calls.register.length, 3);
  assert.equal(source.calls.register.at(-1), reset.shortcuts['hud.startStopRecording'].keys);
  await cleanup();
});

for (const channel of ['preferences:update', 'preferences:update-batch', 'preferences:reset']) {
  test(`${channel} applies startup before publishing settings and rolls back failed OS registration`, async () => {
    const handlers = new Map(),
      sent = [],
      changes = [],
      attempts = [];
    const preferences = { ...shortcutPreferences(), launchAtStartup: channel === 'preferences:reset' ? false : true };
    const previous = structuredClone(preferences);
    const store = storeWith(preferences);
    let fail = true;
    const cleanup = registerPreferencesIpc({
      ipcMain: ipcMainWith(handlers),
      BrowserWindow: { getAllWindows: () => [windowWith(sent)] },
      globalShortcut: { unregisterAll() {}, register() {} },
      store,
      launchAtStartup: {
        apply(next) {
          attempts.push(next.launchAtStartup);
          if (fail) throw new Error('registration denied');
        },
      },
      onPreferencesChanged: (value) => changes.push(value),
    });
    const payload =
      channel === 'preferences:reset'
        ? ['launchAtStartup']
        : channel === 'preferences:update-batch'
          ? [{ launchAtStartup: false }]
          : { launchAtStartup: false };
    await assert.rejects(handlers.get(channel)({}, payload), /registration denied/);
    assert.deepEqual(store.read(), previous);
    assert.equal(sent.length, 0);
    assert.equal(changes.length, 0);
    fail = false;
    const saved = await handlers.get(channel)({}, payload);
    assert.equal(saved.launchAtStartup, !previous.launchAtStartup);
    assert.equal(sent.length, 1);
    assert.equal(changes.length, 1);
    assert.equal(attempts.length, 2);
    await cleanup();
  });
}
test('unrelated or identical preference edits do not touch OS startup registration', async () => {
  const handlers = new Map(),
    preferences = { ...shortcutPreferences(), launchAtStartup: true };
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: { unregisterAll() {}, register() {} },
    store: storeWith(preferences),
    launchAtStartup: {
      apply() {
        assert.fail('unexpected OS registration');
      },
    },
  });
  await handlers.get('preferences:update')({}, { theme: 'dark' });
  await handlers.get('preferences:update')({}, { launchAtStartup: true });
  await handlers.get('preferences:reset')({}, ['alwaysOnTop']);
  await cleanup();
});

test('ordinary preference IPC cannot bypass the native directory picker and resets preserve registered roots', async () => {
  const handlers = new Map(),
    preferences = shortcutPreferences();
  preferences.directories.projects = { directory: '/library', recent: ['/library'] };
  preferences.directories.exports = {
    directory: '/exports',
    lastDirectory: '/previous',
    recent: ['/exports', '/previous'],
  };
  const store = storeWith(preferences);
  const cleanup = registerPreferencesIpc({
    ipcMain: ipcMainWith(handlers),
    BrowserWindow: { getAllWindows: () => [] },
    globalShortcut: { unregisterAll() {}, register() {} },
    store,
  });
  await assert.rejects(handlers.get('preferences:update')({}, { directories: {} }), /directory picker/);
  await assert.rejects(
    handlers.get('preferences:update-batch')({}, [{ theme: 'dark' }, { directories: {} }]),
    /directory picker/,
  );
  assert.equal(store.read().theme, preferences.theme);
  for (const keys of [['directories'], undefined]) {
    const saved = await handlers.get('preferences:reset')({}, keys);
    assert.deepEqual(saved.directories, preferences.directories);
  }
  await cleanup();
});
