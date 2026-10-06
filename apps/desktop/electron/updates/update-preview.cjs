const { EventEmitter } = require('node:events');

// Explicit development-only preview. The installed app always uses electron-updater.
function resolveUpdatePreview({
  app,
  autoUpdater,
  enabled,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (app.isPackaged || !enabled) return { autoUpdater, preview: false };
  const emitter = new EventEmitter();
  const [major, minor, patch] = app.getVersion().split('.').map(Number);
  const version = `${major}.${minor}.${patch + 1}`;
  emitter.checkForUpdates = async () => emitter.emit('update-available', { version });
  emitter.downloadUpdate = async () => {
    for (let percent = 5; percent <= 100; percent += 5) {
      await wait(200);
      emitter.emit('download-progress', { percent });
    }
    emitter.emit('update-downloaded', { version });
  };
  emitter.quitAndInstall = () => {
    console.info('[Update preview] Restart requested. Preview complete.');
  };
  return { autoUpdater: emitter, preview: true };
}

module.exports = { resolveUpdatePreview };
