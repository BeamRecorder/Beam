const UPDATE_CHANNEL = 'app-update:state';

const idleState = (version, status = 'idle') => ({
  status,
  currentVersion: version,
  availableVersion: null,
  percent: null,
  message: null,
});
const versionOf = (info) => (typeof info?.version === 'string' ? info.version : null);
const errorMessage = (error) => (error instanceof Error ? error.message : 'Unable to check for updates.');

function createAutoUpdater({
  app,
  BrowserWindow,
  autoUpdater,
  openExternal,
  isPackaged = app.isPackaged,
  beforeQuitAndInstall = null,
  onUpdateDownloaded = null,
}) {
  let state = idleState(app.getVersion(), isPackaged ? 'idle' : 'unsupported');
  const publish = () =>
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send(UPDATE_CHANNEL, state);
    });
  const setState = (nextState) => {
    state = { ...state, ...nextState };
    publish();
    return state;
  };
  const openChangelog = () =>
    openExternal(
      `https://github.com/BeamRecorder/Beam/releases/tag/${encodeURIComponent(state.availableVersion || state.currentVersion)}`,
    );

  if (!isPackaged)
    return { checkForUpdates: async () => state, getState: () => state, quitAndInstall: () => false, openChangelog };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('checking-for-update', () =>
    setState({ status: 'checking', availableVersion: null, percent: null, message: null }),
  );
  autoUpdater.on('update-available', (info) =>
    setState({ status: 'available', availableVersion: versionOf(info), percent: null, message: null }),
  );
  autoUpdater.on('update-not-available', () =>
    setState({ status: 'not-available', availableVersion: null, percent: null, message: null }),
  );
  autoUpdater.on('download-progress', (progress) =>
    setState({ status: 'downloading', percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) => {
    const availableVersion = versionOf(info);
    if (availableVersion && onUpdateDownloaded) onUpdateDownloaded(availableVersion);
    setState({ status: 'downloaded', availableVersion, percent: 100, message: null });
  });
  autoUpdater.on('error', (error) => setState({ status: 'error', percent: null, message: errorMessage(error) }));
  return {
    async checkForUpdates() {
      try {
        await autoUpdater.checkForUpdates();
      } catch (error) {
        setState({ status: 'error', percent: null, message: errorMessage(error) });
      }
      return state;
    },
    getState: () => state,
    async downloadUpdate() {
      if (state.status !== 'available') return false;
      try {
        await autoUpdater.downloadUpdate();
        return true;
      } catch (error) {
        setState({ status: 'error', percent: null, message: errorMessage(error) });
        return false;
      }
    },
    quitAndInstall: async () => {
      if (state.status !== 'downloaded') return false;
      // Run the central shutdown coordinator first so the native engine and
      // every owned window are released before the installer takes over.
      if (beforeQuitAndInstall) await beforeQuitAndInstall();
      autoUpdater.quitAndInstall();
      return true;
    },
    openChangelog,
  };
}

function registerUpdateIpc(ipcMain, updater) {
  ipcMain.handle('app-update:get-state', () => updater.getState());
  ipcMain.handle('app-update:check', () => updater.checkForUpdates());
  ipcMain.handle('app-update:download', () => updater.downloadUpdate());
  ipcMain.handle('app-update:quit-and-install', () => updater.quitAndInstall());
  ipcMain.handle('app-update:open-changelog', () => updater.openChangelog());
}

module.exports = { UPDATE_CHANNEL, createAutoUpdater, registerUpdateIpc };
