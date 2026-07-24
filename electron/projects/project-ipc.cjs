function registerProjectIpc(ipcMain, projectStore, dialog) {
  ipcMain.handle('projects:list', () => projectStore.list())
  ipcMain.handle('projects:editor-data', (_event, payload = {}) => projectStore.editorData(payload.projectId))
  ipcMain.handle('projects:editor-state', (_event, payload = {}) => projectStore.editorState(payload.projectId))
  ipcMain.handle('projects:save-editor-state', (_event, payload = {}) => projectStore.saveEditorState(payload.projectId, payload.state))
  ipcMain.handle('projects:save-zoom-state', (_event, payload = {}) => projectStore.saveZoom(payload.projectId, payload.zoom))
  ipcMain.handle('projects:create', (_event, options = {}) => projectStore.create(options))
  ipcMain.handle('projects:rename', (_event, payload = {}) => projectStore.rename(payload.projectId, payload.name))
  ipcMain.handle('projects:save-thumbnail', (_event, payload = {}) => projectStore.saveThumbnail(payload.projectId, payload.dataUrl))
  ipcMain.handle('projects:composition', (_event, payload = {}) => projectStore.composition(payload.projectId))
  ipcMain.handle('projects:save-composition', (_event, payload = {}) => projectStore.saveComposition(payload.projectId, payload.composition))
  ipcMain.handle('projects:pick-composition-media', async (_event, payload = {}) => {
    const kind = payload.kind
    const filters = kind === 'image' ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] : kind === 'audio' ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm'] }] : [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'mkv'] }]
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (selected.canceled || !selected.filePaths[0]) return null
    return projectStore.importCompositionMedia(payload.projectId, { kind, source: selected.filePaths[0] })
  })
  ipcMain.handle('projects:pick-background-media', async (_event, payload = {}) => {
    const kind = ['image', 'video', 'media'].includes(payload.kind) ? payload.kind : 'media'
    const extensions = kind === 'image'
      ? ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp']
      : kind === 'video'
        ? ['mp4', 'webm', 'mov', 'm4v', 'ogv']
        : ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'mp4', 'webm', 'mov', 'm4v', 'ogv']
    const label = kind === 'image' ? 'Images' : kind === 'video' ? 'Vidéos' : 'Fonds personnalisés'
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: label, extensions }] })
    if (selected.canceled || !selected.filePaths[0]) return null
    return projectStore.importBackground(payload.projectId, { source: selected.filePaths[0] })
  })
  ipcMain.handle('projects:save-composition-layer', (_event, payload = {}) => projectStore.saveCompositionLayer(payload.projectId, payload.layer))
  ipcMain.handle('projects:delete-composition-layer', (_event, payload = {}) => projectStore.deleteCompositionLayer(payload.projectId, payload.layerId))
  ipcMain.handle('projects:move-composition-layer', (_event, payload = {}) => projectStore.moveCompositionLayer(payload.projectId, payload.layerId, payload.targetIndex))
  ipcMain.handle('projects:delete', (_event, payload = {}) => projectStore.delete(payload.projectId))
}

module.exports = { registerProjectIpc }
