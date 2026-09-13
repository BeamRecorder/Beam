function registerTeleprompterIpc(ipcMain, teleprompterWindow, storage, getSessionOwner) {
  ipcMain.on('teleprompter:show', () => teleprompterWindow.show());
  ipcMain.on('teleprompter:hide', () => teleprompterWindow.hide());
  ipcMain.on('teleprompter:toggle-visibility', () => teleprompterWindow.toggle());
  ipcMain.on('teleprompter:set-session', (event, context) => {
    if (event.sender === getSessionOwner()) teleprompterWindow.setSession(context === null ? null : context);
  });
  ipcMain.on('teleprompter:ready', (event) => teleprompterWindow.markRendererReady(event.sender));
  ipcMain.handle('teleprompter:resume-state', (event) => teleprompterWindow.resumeState(event.sender));
  ipcMain.on('teleprompter:suspended', (event, id, state) =>
    teleprompterWindow.acknowledgeSuspend(event.sender, id, state),
  );
  ipcMain.handle('teleprompter:save-session', (_event, payload = {}) =>
    storage.save(payload.projectId, payload.sessionId, payload.document),
  );
  ipcMain.handle('teleprompter:get-session', (_event, payload = {}) =>
    storage.get(payload.projectId, payload.sessionId),
  );
}

module.exports = { registerTeleprompterIpc };
