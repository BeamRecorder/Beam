function registerEditorPresetIpc({ ipcMain, BrowserWindow, store, kind = 'video' }) {
  const prefix = kind === 'screenshot' ? 'screenshot-presets' : 'editor-presets';
  const broadcast = (document) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(`${prefix}:changed`, document);
    return document;
  };
  ipcMain.handle(`${prefix}:get`, () => store.read());
  ipcMain.handle(`${prefix}:create`, (_event, name) => broadcast(store.create(name)));
  ipcMain.handle(`${prefix}:rename`, (_event, payload = {}) => broadcast(store.rename(payload.id, payload.name)));
  ipcMain.handle(`${prefix}:delete`, (_event, id) => broadcast(store.remove(id)));
  ipcMain.handle(`${prefix}:select`, (_event, id) => broadcast(store.select(id)));
  ipcMain.handle(`${prefix}:update`, (_event, payload = {}) => broadcast(store.update(payload.id, payload.settings)));
  ipcMain.handle(`${prefix}:update-active`, (_event, settings) => broadcast(store.updateActive(settings)));
}

module.exports = { registerEditorPresetIpc };
