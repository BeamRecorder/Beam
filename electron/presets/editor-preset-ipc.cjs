function registerEditorPresetIpc({ ipcMain, BrowserWindow, store }) {
  const broadcast = (document) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('editor-presets:changed', document);
    return document;
  };
  ipcMain.handle('editor-presets:get', () => store.read());
  ipcMain.handle('editor-presets:create', (_event, name) => broadcast(store.create(name)));
  ipcMain.handle('editor-presets:rename', (_event, payload = {}) => broadcast(store.rename(payload.id, payload.name)));
  ipcMain.handle('editor-presets:delete', (_event, id) => broadcast(store.remove(id)));
  ipcMain.handle('editor-presets:select', (_event, id) => broadcast(store.select(id)));
  ipcMain.handle('editor-presets:update', (_event, payload = {}) =>
    broadcast(store.update(payload.id, payload.settings)),
  );
  ipcMain.handle('editor-presets:update-active', (_event, settings) => broadcast(store.updateActive(settings)));
}

module.exports = { registerEditorPresetIpc };
