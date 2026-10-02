const { isDeepStrictEqual } = require('node:util');

function registerPreferencesIpc({
  ipcMain,
  BrowserWindow,
  globalShortcut,
  store,
  shortcutHandler = null,
  onPreferencesChanged = null,
  linuxShortcutSource = null,
}) {
  const broadcast = (preferences) =>
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:changed', preferences));
  const dispatch = (id) => {
    if (shortcutHandler) return shortcutHandler(id);
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:shortcut', id));
  };
  let registration = Promise.resolve();
  const registerShortcuts = (preferences) => {
    registration = registration
      .catch(() => {})
      .then(async () => {
        globalShortcut.unregisterAll();
        let fallbackIds = Object.entries(preferences.shortcuts)
          .filter(([, entry]) => entry.scope === 'global')
          .map(([id]) => id);
        if (linuxShortcutSource) {
          try {
            const result = await linuxShortcutSource.register(preferences);
            if (result === null) {
              await linuxShortcutSource.cleanup().catch(() => {});
            } else {
              fallbackIds = result.fallbackIds;
            }
          } catch {
            await linuxShortcutSource.cleanup().catch(() => {});
          }
        }
        for (const id of fallbackIds) {
          const entry = preferences.shortcuts[id];
          if (!entry || entry.scope !== 'global') continue;
          globalShortcut.register(entry.keys, () => dispatch(id));
        }
      });
    return registration;
  };
  const updateBatch = async (patches) => {
    if (!Array.isArray(patches) || patches.length > 64)
      throw new TypeError('Preference batch must contain at most 64 patches.');
    if (!patches.length) return store.read();
    const { previous, preferences } = store.patchBatch(patches);
    if (!isDeepStrictEqual(previous.shortcuts, preferences.shortcuts)) await registerShortcuts(preferences);
    broadcast(preferences);
    onPreferencesChanged?.(preferences);
    return preferences;
  };
  const reset = async (_event, keys) => {
    const initial = require('./preferences-store.cjs').defaults();
    const current = store.read();
    const next = Array.isArray(keys)
      ? {
          ...current,
          ...Object.fromEntries(keys.filter((key) => key in initial).map((key) => [key, initial[key]])),
        }
      : initial;
    const preferences = store.write(next);
    if (!isDeepStrictEqual(current.shortcuts, preferences.shortcuts)) await registerShortcuts(preferences);
    broadcast(preferences);
    onPreferencesChanged?.(preferences);
    return preferences;
  };

  ipcMain.handle('preferences:get', () => store.read());
  ipcMain.handle('preferences:update', (_event, patch) => updateBatch([patch]));
  ipcMain.handle('preferences:update-batch', (_event, patches) => updateBatch(patches));
  ipcMain.handle('preferences:reset', reset);
  void registerShortcuts(store.read());

  return async () => {
    await registration.catch(() => {});
    await linuxShortcutSource?.cleanup?.();
    globalShortcut.unregisterAll();
  };
}

module.exports = { registerPreferencesIpc };
