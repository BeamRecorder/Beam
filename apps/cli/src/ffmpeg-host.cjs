const { app, BrowserWindow, ipcMain, session } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { createExperimentalGpuExport } = require('@beam/electron-export');
const config = JSON.parse(readFileSync(process.argv.at(-1), 'utf8'));
if (process.platform !== 'linux' || new URL(config.rendererUrl).hostname !== '127.0.0.1')
  throw new Error('Invalid experimental CLI export host.');
app.setPath('userData', config.profile);
// This process owns only an offline export surface. Uncap compositor scheduling
// without changing the authored frame rate or the desktop application's windows.
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.on('window-all-closed', () => {});
const job = { id: config.id, temporaryPath: config.temporaryPath, cancelled: false };
let finishing = false;
const cancel = () => {
  job.cancelled = true;
  job.cancel?.();
};
process.on('SIGINT', cancel);
process.on('SIGTERM', cancel);
app.on('before-quit', (event) => {
  if (!finishing) {
    event.preventDefault();
    cancel();
  }
});

app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const service = createExperimentalGpuExport({
      ipcMain,
      BrowserWindow,
      nativeDirectory: config.nativeDirectory,
      preload: config.preload,
      renderer: { url: config.rendererUrl },
    });
    try {
      const diagnostics = await service.run({ send: () => {} }, job, config.request);
      writeFileSync(config.resultPath, JSON.stringify(diagnostics), { flag: 'wx', mode: 0o600 });
      finishing = true;
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      finishing = true;
      app.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
