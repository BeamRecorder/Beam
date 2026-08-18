const fs = require('fs');
const CURSOR_PACK_DISCOVERY_URL = 'https://store.kde.org/browse/cat/107/';

function registerProjectIpc(
  ipcMain,
  projectStore,
  backgroundLibrary,
  fontLibrary,
  dialog,
  BrowserWindow,
  trustedRenderer,
  cursorLibrary,
) {
  ipcMain.handle('projects:list', () => projectStore.list());
  ipcMain.handle('projects:media-url', (_event, payload = {}) => projectStore.mediaUrlFor(payload.source));
  ipcMain.handle('projects:editor-data', (_event, payload = {}) => projectStore.editorData(payload.projectId));
  ipcMain.handle('projects:editor-state', (_event, payload = {}) => projectStore.editorState(payload.projectId));
  ipcMain.handle('projects:save-editor-state', (_event, payload = {}) =>
    projectStore.saveEditorState(payload.projectId, payload.state),
  );
  ipcMain.handle('projects:create', (_event, options = {}) => projectStore.create(options));
  ipcMain.handle('projects:rename', (_event, payload = {}) => projectStore.rename(payload.projectId, payload.name));
  ipcMain.handle('projects:save-thumbnail', (_event, payload = {}) =>
    projectStore.saveThumbnail(payload.projectId, payload.dataUrl),
  );
  ipcMain.handle('projects:pick-media', async (_event, payload = {}) => {
    const kind = payload.kind;
    const filters =
      kind === 'image'
        ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        : kind === 'audio'
          ? [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'webm'] }]
          : [{ name: 'Vidéos', extensions: ['mp4', 'webm', 'mov', 'mkv'] }];
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return projectStore.importEditorMedia(payload.projectId, { kind, source: selected.filePaths[0] });
  });
  ipcMain.handle('projects:import-dropped-media', (_event, payload = {}) =>
    projectStore.importDroppedProjectMedia(payload.projectId, { kind: payload.kind, source: payload.source }),
  );
  const notifyBackgroundLibraryChanged = () => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('background-library:changed');
  };
  ipcMain.handle('background-library:list', () => backgroundLibrary.list());
  ipcMain.handle('background-library:pick-import', async (_event, payload = {}) => {
    const kind = ['image', 'video', 'media'].includes(payload.kind) ? payload.kind : 'media';
    const extensions =
      kind === 'image'
        ? ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp']
        : kind === 'video'
          ? ['mp4', 'webm', 'mov', 'm4v', 'ogv']
          : ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'mp4', 'webm', 'mov', 'm4v', 'ogv'];
    const label = kind === 'image' ? 'Images' : kind === 'video' ? 'Vidéos' : 'Fonds personnalisés';
    const selected = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: label, extensions }] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const background = backgroundLibrary.importFile(selected.filePaths[0]);
    notifyBackgroundLibraryChanged();
    return background;
  });
  const notifyFontLibraryChanged = () => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('font-library:changed');
  };
  const requireTrustedFontSender = (event) => {
    if (!trustedRenderer?.(event.sender.getURL())) throw new Error('Renderer non autorisé');
  };
  ipcMain.handle('font-library:list', (event) => {
    requireTrustedFontSender(event);
    return fontLibrary.list();
  });
  ipcMain.handle('font-library:pick-import', async (event) => {
    requireTrustedFontSender(event);
    const selected = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Polices', extensions: ['ttf', 'otf', 'woff', 'woff2'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const font = fontLibrary.importFile(selected.filePaths[0]);
    notifyFontLibraryChanged();
    return font;
  });
  const notifyCursorPacksChanged = () => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('cursor-packs:changed');
  };
  const requireTrustedCursorSender = (event) => {
    if (!trustedRenderer?.(event.sender.getURL())) throw new Error('Renderer non autorisé');
  };
  ipcMain.handle('cursor-packs:list', (event) => {
    requireTrustedCursorSender(event);
    if (!cursorLibrary) throw new Error('Bibliothèque de curseurs indisponible');
    return cursorLibrary.list();
  });
  ipcMain.handle('cursor-packs:pick-import', async (event) => {
    requireTrustedCursorSender(event);
    if (!cursorLibrary) throw new Error('Bibliothèque de curseurs indisponible');
    const selected = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const result = cursorLibrary.importDirectory(selected.filePaths[0]);
    notifyCursorPacksChanged();
    return result;
  });
  ipcMain.handle('cursor-packs:open-discovery', (event) => {
    requireTrustedCursorSender(event);
    return require('electron').shell.openExternal(CURSOR_PACK_DISCOVERY_URL);
  });
  ipcMain.handle('projects:delete', (_event, payload = {}) => projectStore.delete(payload.projectId));
  ipcMain.handle('projects:reveal', (_event, payload = {}) => {
    const { shell } = require('electron');
    try {
      const directory = projectStore.directoryFor(payload.projectId);
      if (directory && fs.existsSync(directory)) {
        shell.openPath(directory);
        return true;
      }
    } catch (e) {
      console.error('Failed to reveal project:', e);
    }
    return false;
  });
}

module.exports = { CURSOR_PACK_DISCOVERY_URL, registerProjectIpc };
