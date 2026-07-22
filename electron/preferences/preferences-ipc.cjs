function registerPreferencesIpc({ ipcMain, BrowserWindow, globalShortcut, store }) {
  const broadcast = (preferences) => BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:changed', preferences))
  const registerShortcuts = (preferences) => {
    globalShortcut.unregisterAll()
    for (const [id, entry] of Object.entries(preferences.shortcuts)) {
      if (entry.scope !== 'global') continue
      globalShortcut.register(entry.keys, () => BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('preferences:shortcut', id)))
    }
  }
  const update = (patch) => { const preferences = store.patch(patch); registerShortcuts(preferences); broadcast(preferences); return preferences }
  ipcMain.handle('preferences:get', () => store.read())
  ipcMain.handle('preferences:update', (_event, patch) => update(patch))
  ipcMain.handle('preferences:reset', (_event, keys) => {
    const initial = require('./preferences-store.cjs').defaults(); const current = store.read()
    const next = Array.isArray(keys) ? { ...current, ...Object.fromEntries(keys.filter((key) => key in initial).map((key) => [key, initial[key]])) } : initial
    const preferences = store.write(next); registerShortcuts(preferences); broadcast(preferences); return preferences
  })
  registerShortcuts(store.read())
  return () => globalShortcut.unregisterAll()
}
module.exports = { registerPreferencesIpc }
