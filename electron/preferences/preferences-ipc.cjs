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
        let registeredByLinux = false;
        if (linuxShortcutSource) {
          try {
            registeredByLinux = await linuxShortcutSource.register(preferences);
            if (!registeredByLinux) await linuxShortcutSource.cleanup();
          } catch {
            await linuxShortcutSource.cleanup().catch(() => {});
          }
        }
        if (registeredByLinux) return;
        for (const [id, entry] of Object.entries(preferences.shortcuts)) {
          if (entry.scope !== 'global') continue;
          globalShortcut.register(entry.keys, () => dispatch(id));
        }
      });
    return registration;
  };
  const update = async (patch) => {
    const preferences = store.patch(patch);
    await registerShortcuts(preferences);
    broadcast(preferences);
    onPreferencesChanged?.(preferences);
    return preferences;
  };
  const reset = async (_event, keys) => {
    const initial = require('./preferences-store.cjs').defaults();
    const current = store.read();
    const next = Array.isArray(keys)
      ? { ...current, ...Object.fromEntries(keys.filter((key) => key in initial).map((key) => [key, initial[key]])) }
      : initial;
    const preferences = store.write(next);
    await registerShortcuts(preferences);
    broadcast(preferences);
    onPreferencesChanged?.(preferences);
    return preferences;
  };

  ipcMain.handle('preferences:get', () => store.read());
  ipcMain.handle('preferences:update', (_event, patch) => update(patch));
  ipcMain.handle('preferences:reset', reset);
  void registerShortcuts(store.read());

  return async () => {
    await registration.catch(() => {});
    await linuxShortcutSource?.cleanup?.();
    globalShortcut.unregisterAll();
  };
}

module.exports = { registerPreferencesIpc };
