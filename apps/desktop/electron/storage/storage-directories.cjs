const fs = require('node:fs');
const path = require('node:path');
const { normalizeDirectorySettings, validDirectory, pathKey, MAX_PROJECT_ROOTS } = require('./directory-settings.cjs');
const { organizeProjectCategories } = require('./project-categories.cjs');

function createStorageDirectories({
  store,
  defaultProjectsDirectory,
  defaultExportDirectory,
  BrowserWindow,
  dialog,
  platform = process.platform,
}) {
  let settings = normalizeDirectorySettings(store.read().directories, platform);
  const hydrate = (preferences) => {
    settings = normalizeDirectorySettings(preferences.directories, platform);
  };
  const snapshot = () => ({ ...structuredClone(settings), defaultProjectsDirectory, defaultExportDirectory });
  const projectRoot = () => settings.projects.directory ?? defaultProjectsDirectory;
  const writableProjectRoot = () => {
    const root = projectRoot();
    if (!fs.statSync(root).isDirectory()) throw new Error('Project location is not a directory.');
    return root;
  };
  const projectRoots = () => [
    ...new Map(
      [defaultProjectsDirectory, ...settings.projects.recent].map((root) => [pathKey(root, platform), root]),
    ).values(),
  ];
  const exportDirectory = () => settings.exports.directory ?? settings.exports.lastDirectory ?? defaultExportDirectory;
  const publish = (next) => {
    const previousProjects = JSON.stringify(settings.projects);
    const preferences = store.patch({ directories: next });
    hydrate(preferences);
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send('preferences:changed', preferences);
      if (previousProjects !== JSON.stringify(settings.projects)) window.webContents.send('projects:locations-changed');
    }
    return snapshot();
  };
  const requireKind = (kind) => {
    if (kind !== 'projects' && kind !== 'exports') throw new TypeError('Invalid directory kind.');
  };
  const select = (kind, directory, picked = false) => {
    requireKind(kind);
    hydrate(store.read());
    const normalized = directory === null ? null : validDirectory(directory, platform);
    if (
      directory !== null &&
      (!normalized ||
        (!picked && !settings[kind].recent.some((item) => pathKey(item, platform) === pathKey(normalized, platform))))
    )
      throw new TypeError('Directory was not selected through Beam.');
    if (kind === 'projects') {
      if (
        normalized &&
        settings.projects.recent.length >= MAX_PROJECT_ROOTS &&
        !projectRoots().some((root) => pathKey(root, platform) === pathKey(normalized, platform))
      )
        throw new Error('Too many project locations.');
      const root = normalized ?? defaultProjectsDirectory;
      if (!fs.statSync(root).isDirectory()) throw new Error('Project location is not a directory.');
      // Establish the categorized tree before publishing a new recording destination.
      organizeProjectCategories(path.join(root, 'projects'));
    } else if (normalized && !fs.statSync(normalized).isDirectory())
      throw new Error('Export location is not a directory.');
    const next = structuredClone(settings);
    next[kind].directory = normalized;
    next[kind].recent = normalized
      ? [normalized, ...next[kind].recent.filter((item) => pathKey(item, platform) !== pathKey(normalized, platform))]
      : next[kind].recent;
    return publish(next);
  };
  return {
    hydrate,
    snapshot,
    projectRoot,
    writableProjectRoot,
    projectRoots,
    exportDirectory,
    select: (kind, directory) => select(kind, directory),
    async choose(event, kind) {
      requireKind(kind);
      hydrate(store.read());
      const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        defaultPath: kind === 'projects' ? projectRoot() : exportDirectory(),
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled || !result.filePaths[0] ? null : select(kind, result.filePaths[0], true);
    },
    rememberExport(file) {
      hydrate(store.read());
      const directory = (platform === 'win32' ? path.win32 : path.posix).dirname(file);
      const next = structuredClone(settings);
      next.exports.lastDirectory = directory;
      next.exports.recent = [
        directory,
        ...next.exports.recent.filter((item) => pathKey(item, platform) !== pathKey(directory, platform)),
      ];
      try {
        publish(next);
      } catch (error) {
        // File publication has succeeded; a preference error cannot turn it into a failed export.
        settings = normalizeDirectorySettings(next, platform);
        console.error('[Beam export directory] Unable to save the last directory.', error);
      }
    },
  };
}
function registerStorageDirectoryIpc(ipcMain, directories) {
  ipcMain.handle('directories:get', () => directories.snapshot());
  ipcMain.handle('directories:choose', (event, kind) => directories.choose(event, kind));
  ipcMain.handle('directories:select', (_event, request = {}) => directories.select(request.kind, request.directory));
}
module.exports = { createStorageDirectories, registerStorageDirectoryIpc };
