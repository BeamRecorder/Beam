function registerWhisperIpc({ ipcMain, store }) {
  ipcMain.handle('whisper:models', () => Promise.all(store.models.map((id) => store.state(id))))
  ipcMain.handle('whisper:download', async (event, payload = {}) => store.download(payload.modelId, (progress) => event.sender.send('whisper:progress', progress)))
}
module.exports = { registerWhisperIpc }
