const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createSourcePickerController } = require('./source-picker-controller.cjs');
const { isDevelopmentSourceDataEnabled } = require('./source-picker-state.cjs');
const { createDevelopmentSourceProvider } = require('./development-source-provider.cjs');
const { createNativeSourceProvider } = require('./native-source-provider.cjs');

function isHudSourcePickerOwner(url, applicationRoot, isPackaged) {
  try {
    const target = new URL(url);
    if (target.search || target.hash) return false;
    return isPackaged
      ? fileURLToPath(target) === path.join(applicationRoot, 'dist/index.html')
      : target.origin === 'http://localhost:6500' && ['/', '/index.html'].includes(target.pathname);
  } catch {
    return false;
  }
}

function registerSourcePickerIpc({
  ipcMain,
  BrowserWindow,
  screen,
  app,
  applicationRoot,
  platform,
  desktopCapturer,
  requestNative,
  getNativePreview,
  canAcceptWork,
}) {
  let manager = null;
  let owner = null;
  const isPackaged = app.isPackaged === true;
  const development = isDevelopmentSourceDataEnabled(isPackaged);
  ipcMain.handle('source-picker:open', (event, kind) => {
    if (!canAcceptWork()) throw new Error('Source selection is unavailable during application shutdown');
    if (!isHudSourcePickerOwner(event.sender.getURL(), applicationRoot, isPackaged))
      throw new Error('Only the HUD can select a capture source');
    if (platform === 'linux' && !development) throw new Error('Linux capture selection belongs to the Portal');
    const hudWindow = BrowserWindow.fromWebContents(event.sender);
    if (!hudWindow || hudWindow.isDestroyed()) throw new Error('The capture HUD is unavailable');
    if (manager && owner !== event.sender) throw new Error('Another HUD owns source selection');
    if (!manager) {
      owner = event.sender;
      const provider = development
        ? createDevelopmentSourceProvider(screen.getDisplayMatching(hudWindow.getBounds()).bounds)
        : createNativeSourceProvider({
            platform,
            screen,
            desktopCapturer,
            BrowserWindow,
            requestNative,
            getNativePreview,
          });
      manager = createSourcePickerController({
        BrowserWindow,
        screen,
        hudWindow,
        applicationRoot,
        isPackaged,
        platform,
        provider,
      });
    }
    return manager.open(kind);
  });
  ipcMain.on('source-picker:ready', (event) => manager?.markReady(event.sender));
  ipcMain.on('source-picker:action', (event, action) => {
    if (!manager?.ownsChooser(event.sender)) return;
    try {
      manager.action(action);
    } catch (error) {
      manager.reportError(error);
    }
  });
  app.once('before-quit', () => manager?.destroy());
}

module.exports = { registerSourcePickerIpc, isHudSourcePickerOwner };
