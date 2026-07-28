function registerProjectIpc(ipcMain, projectStore, backgroundLibrary, dialog, BrowserWindow) {
  ipcMain.handle('projects:list', () => projectStore.list())
  ipcMain.handle('projects:media-url', (_event, payload = {}) => projectStore.mediaUrlFor(payload.source))
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
  const notifyBackgroundLibraryChanged = () => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('background-library:changed')
  }
  ipcMain.handle('background-library:list', () => backgroundLibrary.list())
  ipcMain.handle('background-library:pick-import', async (_event, payload = {}) => {
    const kind = ['image', 'video', 'media'].includes(payload.kind) ? payload.kind : 'media'
    const extensions = kind === 'image'
      ? ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp']
      : kind === 'video'
        ? ['mp4', 'webm', 'mov', 'm4v', 'ogv']
        : ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'mp4', 'webm', 'mov', 'm4v', 'ogv']
    const label = kind === 'image' ? 'Images' : kind === 'video' ? 'Vidéos' : 'Fonds personnalisés'
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: label, extensions }] })
    if (selected.canceled || !selected.filePaths[0]) return null
    const background = backgroundLibrary.importFile(selected.filePaths[0])
    notifyBackgroundLibraryChanged()
    return background
  })
  ipcMain.handle('projects:delete', (_event, payload = {}) => projectStore.delete(payload.projectId))
}

module.exports = { registerProjectIpc }
