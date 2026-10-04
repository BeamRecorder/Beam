const path = require('path');
const { createAutoUpdater, registerUpdateIpc } = require('../updates/auto-updater.cjs');
const { createUpdateCache, updaterCacheDirectory } = require('../updates/update-cache.cjs');
function initializeApplicationUpdater({ app, BrowserWindow, autoUpdater, coordinator, applicationIpc }) {
  const updateCache = app.isPackaged
    ? createUpdateCache({
        stateFile: path.join(app.getPath('userData'), 'update-cache-state.json'),
        cacheDirectory: updaterCacheDirectory(),
      })
    : null;
  if (updateCache) {
    try {
      updateCache.cleanupForVersion(app.getVersion());
    } catch (error) {
      console.warn('[Updater] Unable to clean installed update cache:', error);
    }
  }
  const updater = createAutoUpdater({
    app,
    BrowserWindow,
    autoUpdater,
    openExternal: require('electron').shell.openExternal,
    beforeQuitAndInstall: () => coordinator.requestShutdown('updater'),
    onUpdateDownloaded: (targetVersion) => {
      try {
        updateCache?.markDownloaded(app.getVersion(), targetVersion);
      } catch (error) {
        console.warn('[Updater] Unable to record the downloaded update:', error);
      }
    },
  });
  registerUpdateIpc(applicationIpc, updater);
  return updater;
}
module.exports = { initializeApplicationUpdater };
