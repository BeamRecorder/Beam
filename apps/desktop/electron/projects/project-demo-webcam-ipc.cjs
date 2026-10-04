const path = require('node:path');

function registerProjectDemoWebcamIpc({
  ipcMain,
  projectStore,
  trustedRenderer,
  applicationRoot = path.resolve(__dirname, '../../../..'),
  isPackaged = false,
}) {
  const source = path.join(applicationRoot, isPackaged ? 'dist' : 'public', 'dev-media', 'demo-webcam.mp4');
  ipcMain.handle('projects:import-demo-webcam', (event, payload = {}) => {
    if (!trustedRenderer?.(event.sender.getURL())) throw new Error('Renderer non autorisé');
    return projectStore.importEditorMedia(payload.projectId, { kind: 'video', source });
  });
}

module.exports = { registerProjectDemoWebcamIpc };
