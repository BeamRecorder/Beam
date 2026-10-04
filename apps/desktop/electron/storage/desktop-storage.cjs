const path = require('node:path');
const fs = require('node:fs');
const { createUserPaths } = require('./user-paths.cjs');
const { createCaptureStores } = require('./capture-stores.cjs');
const { initializeDesktopPreferences } = require('../preferences/desktop-preferences.cjs');
const { organizeProjectCategories } = require('./project-categories.cjs');
const { createStorageDirectories, registerStorageDirectoryIpc } = require('./storage-directories.cjs');
const { createProjectStore } = require('../projects/project-store.cjs');

function initializeDesktopStorage({ app, ipcMain, BrowserWindow, dialog, applicationRoot }) {
  const original = createUserPaths(app);
  const preferences = initializeDesktopPreferences(app, original.preferences);
  const directories = createStorageDirectories({
    store: preferences.preferencesStore,
    defaultProjectsDirectory: original.user,
    defaultExportDirectory: app.getPath('videos'),
    BrowserWindow,
    dialog,
  });
  registerStorageDirectoryIpc(ipcMain, directories);
  const userPaths = createUserPaths(app, {
    projectRoot: directories.projectRoot,
    recordingRoot: directories.writableProjectRoot,
  });
  organizeProjectCategories(original.projects);
  // Historical locations can be unplugged. Startup must not recreate or migrate them.
  if (directories.projectRoot() !== original.user && fs.existsSync(directories.projectRoot()))
    organizeProjectCategories(userPaths.projects);
  const captures = createCaptureStores({
    userPaths,
    preferencesStore: preferences.preferencesStore,
    applicationRoot,
    isPackaged: app.isPackaged,
    screenshotLocations: {
      roots: () => directories.projectRoots().map((root) => path.join(root, 'projects', 'screenshot')),
      writeRoot: () => path.join(directories.writableProjectRoot(), 'projects', 'screenshot'),
    },
  });
  const projectStore = createProjectStore(original.projects, {
    category: 'studio',
    roots: () => directories.projectRoots().map((root) => path.join(root, 'projects')),
    writeRoot: () => path.join(directories.writableProjectRoot(), 'projects'),
  });
  return { ...preferences, ...captures, userPaths, projectStore, directories };
}
module.exports = { initializeDesktopStorage };
