function registerTeleprompterIpc({ ipcMain, teleprompterWindow, storage }) {
  ipcMain.on('teleprompter:show', () => teleprompterWindow.show())
  ipcMain.on('teleprompter:hide', () => teleprompterWindow.hide())
  ipcMain.on('teleprompter:toggle-visibility', () => teleprompterWindow.toggle())
  ipcMain.on('teleprompter:set-session', (_event, context) => teleprompterWindow.setSession(context === null ? null : context))
  ipcMain.handle('teleprompter:save-session', (_event, payload = {}) => storage.save(payload.projectId, payload.sessionId, payload.document))
  ipcMain.handle('teleprompter:get-session', (_event, payload = {}) => storage.get(payload.projectId, payload.sessionId))
}

module.exports = { registerTeleprompterIpc }
