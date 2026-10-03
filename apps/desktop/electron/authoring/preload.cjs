const { ipcRenderer } = require('electron');
module.exports = {
  registerAuthoringDocument: (context) => ipcRenderer.invoke('authoring:register', context),
  onAuthoringRequest: (listener) => {
    const callback = (_event, message) => listener(message);
    ipcRenderer.on('authoring:request', callback);
    return () => ipcRenderer.removeListener('authoring:request', callback);
  },
  replyAuthoringRequest: (id, response) => ipcRenderer.send('authoring:reply', id, response),
  renderHtmlFrame: (html, timeMs) => ipcRenderer.invoke('authoring:html-frame', html, timeMs),
  getHtmlPreviewSource: (html) => ipcRenderer.invoke('authoring:html-preview-source', html),
  getHtmlFrameSources: (assetIds) => ipcRenderer.invoke('authoring:html-sources', assetIds),
};
