function registerProjectIpc(ipcMain, projectStore) {
  ipcMain.handle('projects:list', () => projectStore.list())
  ipcMain.handle('projects:editor-data', (_event, payload = {}) => projectStore.editorData(payload.projectId))
  ipcMain.handle('projects:save-zoom-state', (_event, payload = {}) => projectStore.saveZoom(payload.projectId, payload.zoom))
  ipcMain.handle('projects:create', (_event, options = {}) => projectStore.create(options))
  ipcMain.handle('projects:rename', (_event, payload = {}) => projectStore.rename(payload.projectId, payload.name))
  ipcMain.handle('projects:delete', (_event, payload = {}) => projectStore.delete(payload.projectId))
}

module.exports = { registerProjectIpc }
