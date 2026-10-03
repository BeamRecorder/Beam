const fs = require('node:fs');
const { Readable } = require('node:stream');
const { createProjectMediaHandler } = require('../projects/project-media-protocol.cjs');
const { createWhisperModelStore } = require('../captions/whisper-model-store.cjs');
const { registerWhisperIpc } = require('../captions/whisper-ipc.cjs');

function registerMediaProtocols({ protocol, ipcMain, whisperModels, ...stores }) {
  protocol.handle('project-media', createProjectMediaHandler(stores));
  const whisperStore = createWhisperModelStore(whisperModels);
  protocol.handle('whisper-model', (request) => {
    const file = whisperStore.fileForUrl(request.url);
    return file
      ? new Response(Readable.toWeb(fs.createReadStream(file)), {
          headers: { 'Content-Length': String(fs.statSync(file).size) },
        })
      : new Response('Not found', { status: 404 });
  });
  registerWhisperIpc({ ipcMain, store: whisperStore });
}
module.exports = { registerMediaProtocols };
