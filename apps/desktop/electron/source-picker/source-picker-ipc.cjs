const path = require('node:path');
const { developmentOrigin } = require('../lifecycle/development-session.cjs');
const { fileURLToPath } = require('node:url');
const { createSourcePickerController } = require('./source-picker-controller.cjs');
const { isDevelopmentSourceDataEnabled } = require('./source-picker-state.cjs');
const { createDevelopmentSourceProvider } = require('./development-source-provider.cjs');
const { createNativeSourceProvider } = require('./native-source-provider.cjs');

function isHudSourcePickerOwner(url, applicationRoot, isPackaged, environment = process.env) {
  try {
    const target = new URL(url);
    if (target.search || target.hash) return false;
    return isPackaged
      ? fileURLToPath(target) === path.join(applicationRoot, 'dist/html/index.html')
      : target.origin === developmentOrigin(environment) && target.pathname === '/html/index.html';
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
  const managers = new Map();
  let activeOwner = null;
  const isPackaged = app.isPackaged === true;
  const development = isDevelopmentSourceDataEnabled(isPackaged);
  const openForWindow = (hudWindow, kind) => {
    if (!['screen', 'window'].includes(kind)) throw new TypeError('Invalid source picker kind');
    if (!canAcceptWork()) throw new Error('Source selection is unavailable during application shutdown');
    if (platform === 'linux' && !development) throw new Error('Linux capture selection belongs to the Portal');
    if (!hudWindow || hudWindow.isDestroyed()) throw new Error('The capture toolbar is unavailable');
    const owner = hudWindow.webContents;
    if (activeOwner && activeOwner !== owner) throw new Error('Another toolbar owns source selection');
    let manager = managers.get(owner);
    if (!manager) {
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
      managers.set(owner, manager);
      hudWindow.once('closed', () => managers.delete(owner));
    }
    activeOwner = owner;
    try {
      return Promise.resolve(manager.open(kind)).finally(() => {
        if (activeOwner === owner) activeOwner = null;
      });
    } catch (error) {
      activeOwner = null;
      throw error;
    }
  };
  ipcMain.handle('source-picker:open', (event, kind) => {
    if (!isHudSourcePickerOwner(event.sender.getURL(), applicationRoot, isPackaged))
      throw new Error('Only the HUD can select a capture source');
    return openForWindow(BrowserWindow.fromWebContents(event.sender), kind);
  });
  ipcMain.on('source-picker:ready', (event) =>
    [...managers.values()].forEach((manager) => manager.markReady(event.sender)),
  );
  ipcMain.on('source-picker:action', (event, action) => {
    const manager = [...managers.values()].find((candidate) => candidate.ownsChooser(event.sender));
    if (!manager) return;
    try {
      manager.action(action);
    } catch (error) {
      manager.reportError(error);
    }
  });
  app.once('before-quit', () => {
    for (const manager of managers.values()) manager.destroy();
    managers.clear();
  });
  return {
    openForWindow,
    cancel(owner) {
      managers.get(owner)?.destroy();
      managers.delete(owner);
    },
  };
}

module.exports = { registerSourcePickerIpc, isHudSourcePickerOwner };
