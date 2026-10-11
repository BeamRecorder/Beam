const { isDeepStrictEqual } = require('node:util');
const globalBindings = (shortcuts) =>
  Object.fromEntries(Object.entries(shortcuts).filter(([, entry]) => entry.scope === 'global'));
const { backgroundCatalogPatch } = require('./background-catalog.cjs');

function registerPreferencesIpc({
  ipcMain,
  BrowserWindow,
  globalShortcut,
  store,
  shortcutHandler = null,
  onPreferencesChanged = null,
  linuxShortcutSource = null,
  launchAtStartup = null,
}) {
  let capturingShortcut = false;
  let disposed = false;
  const applyStartup = (previous, preferences) => {
    if (!launchAtStartup || previous.launchAtStartup === preferences.launchAtStartup) return;
    try {
      launchAtStartup.apply(preferences);
    } catch (error) {
      // Do not publish an enabled preference when OS registration failed.
      store.write(previous);
      throw error;
    }
  };
  const broadcast = (preferences) =>
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:changed', preferences));
  const dispatch = (id) => {
    if (capturingShortcut) return false;
    if (shortcutHandler) return shortcutHandler(id);
    BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:shortcut', id));
  };
  let registration = Promise.resolve();
  const registerShortcuts = (preferences) => {
    registration = registration
      .catch(() => {})
      .then(async () => {
        if (disposed) return;
        globalShortcut.unregisterAll();
        if (capturingShortcut) preferences = { ...preferences, shortcuts: {} };
        let fallbackIds = Object.entries(preferences.shortcuts)
          .filter(([, entry]) => entry.scope === 'global' && entry.keys)
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
          if (!entry || entry.scope !== 'global' || !entry.keys) continue;
          if (globalShortcut.register(entry.keys, () => dispatch(id)) === false)
            throw new Error(`This shortcut is unavailable: ${entry.keys}`);
        }
      });
    return registration;
  };
  const updateBatch = async (patches) => {
    if (!Array.isArray(patches) || patches.length > 64)
      throw new TypeError('Preference batch must contain at most 64 patches.');
    if (patches.some((patch) => patch && Object.hasOwn(patch, 'directories')))
      throw new TypeError('Storage locations must be changed through the directory picker.');
    if (!patches.length) return store.read();
    const { previous, preferences } = store.patchBatch(patches);
    applyStartup(previous, preferences);
    if (!isDeepStrictEqual(globalBindings(previous.shortcuts), globalBindings(preferences.shortcuts))) {
      try {
        await registerShortcuts(preferences);
      } catch (error) {
        const restored = store.patch({ shortcuts: previous.shortcuts });
        await registerShortcuts(restored);
        throw error;
      }
    }
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
    // A preference reset must not forget the roots containing the user's projects.
    next.directories = current.directories;
    const preferences = store.write(next);
    applyStartup(current, preferences);
    if (!isDeepStrictEqual(globalBindings(current.shortcuts), globalBindings(preferences.shortcuts)))
      await registerShortcuts(preferences);
    broadcast(preferences);
    onPreferencesChanged?.(preferences);
    return preferences;
  };

  ipcMain.handle('preferences:get', () => store.read());
  ipcMain.handle('preferences:update', (_event, patch) => updateBatch([patch]));
  ipcMain.handle('preferences:update-batch', (_event, patches) => updateBatch(patches));
  ipcMain.handle('preferences:reset', reset);
  ipcMain.handle('preferences:background-catalog', (_event, request) =>
    updateBatch([backgroundCatalogPatch(store.read(), request)]),
  );
  void registerShortcuts(store.read()).catch((error) => console.error('[Shortcuts]', error));

  const cleanup = async () => {
    disposed = true;
    await registration.catch(() => {});
    await linuxShortcutSource?.cleanup?.();
    globalShortcut.unregisterAll();
  };
  cleanup.setShortcutCapture = async (active) => {
    if (disposed || capturingShortcut === active) return;
    capturingShortcut = active;
    await registerShortcuts(store.read());
  };
  return cleanup;
}

module.exports = { registerPreferencesIpc };
