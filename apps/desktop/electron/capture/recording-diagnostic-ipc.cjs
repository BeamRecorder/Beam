const { createRecordingDiagnosticService } = require('./recording-diagnostic-report.cjs');

function registerRecordingDiagnosticIpc({ ipcMain, BrowserWindow, isTrustedRenderer, canAcceptWork }) {
  const service = createRecordingDiagnosticService();
  ipcMain.handle('capture:diagnostic-report', (event, context) => {
    if (
      !canAcceptWork() ||
      event.sender.isDestroyed() ||
      event.senderFrame !== event.sender.mainFrame ||
      !isTrustedRenderer(event.sender.getURL())
    )
      throw new Error('Recording diagnostic sender is not authorized.');
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || owner.isDestroyed()) throw new Error('Recording diagnostics require an owning window.');
    return service.report(context);
  });
  return service;
}
module.exports = { registerRecordingDiagnosticIpc };
