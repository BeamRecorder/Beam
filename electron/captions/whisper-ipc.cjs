function registerWhisperIpc({ ipcMain, store }) {
  ipcMain.handle('whisper:models', () => Promise.all(store.models.map((id) => store.state(id))));
  ipcMain.handle('whisper:download', async (event, payload = {}) =>
    store.download(payload.modelId, (progress) => event.sender.send('whisper:progress', progress)),
  );
  ipcMain.handle('whisper:delete', async (_event, payload = {}) => store.delete(payload.modelId));
}
module.exports = { registerWhisperIpc };
