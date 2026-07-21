function registerWhisperIpc({ ipcMain, store }) {
  ipcMain.handle('whisper:models', () => store.models.map(store.state))
  ipcMain.handle('whisper:download', async (event, payload = {}) => store.download(payload.modelId, (progress) => event.sender.send('whisper:progress', progress)))
}
module.exports = { registerWhisperIpc }
