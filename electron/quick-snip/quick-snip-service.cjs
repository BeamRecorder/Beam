const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const { createQuickSnipController } = require('./quick-snip-controller.cjs');
const { createQuickSnipWindow } = require('./quick-snip-window.cjs');
const { createQuickSnipStatusWindow } = require('./quick-snip-status-window.cjs');
const { createQuickSnipFinalizer } = require('./quick-snip-finalizer.cjs');

function createQuickSnipService(options) {
  const { BrowserWindow, applicationIpc, userPaths, screen, nativeImage, clipboard } = options;
  let normalRecordingActive = false;
  const cropWindow = createQuickSnipWindow(options);
  const statusWindow = createQuickSnipStatusWindow(options);
  const requireOutputFile = (file) => {
    const target = path.resolve(String(file || ''));
    const roots = [userPaths.quickSnipStudio, userPaths.quickSnipRaw].map((root) => path.resolve(root));
    if (!roots.some((root) => target.startsWith(`${root}${path.sep}`)) || !fs.statSync(target).isFile())
      throw new Error('Quick Snip clipboard path is invalid.');
    return target;
  };
  const copyFile = (file) => {
    const target = requireOutputFile(file);
    if (process.platform === 'darwin') {
      const escaped = target.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><array><string>${escaped}</string></array></plist>`;
      clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist));
      return { native: true, fallback: null };
    }
    if (process.platform === 'win32') {
      const names = Buffer.from(`${target}\0\0`, 'utf16le');
      const dropFiles = Buffer.alloc(20);
      dropFiles.writeUInt32LE(20, 0);
      dropFiles.writeUInt32LE(1, 16);
      clipboard.writeBuffer('CF_HDROP', Buffer.concat([dropFiles, names]));
      return { native: true, fallback: null };
    }
    const fallback = pathToFileURL(target).href;
    clipboard.writeText(fallback);
    return { native: false, fallback };
  };
  const controller = createQuickSnipController({
    userPaths,
    preferencesStore: options.preferencesStore,
    presetStore: options.presetStore,
    projectStore: options.projectStore,
    regionOverlay: options.regionOverlay,
    cropWindow,
    statusWindow,
    resolveDisplay: (displayId) =>
      screen.getAllDisplays().find((display) => String(display.id) === String(displayId)) ||
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
      screen.getPrimaryDisplay(),
    isNormalRecordingActive: () => normalRecordingActive,
    finalize: createQuickSnipFinalizer({ userPaths, projectStore: options.projectStore }),
    copyFile,
    thumbnail: async (session) => {
      const source =
        typeof session?.videoSrc === 'string' && session.videoSrc.startsWith('file:')
          ? fileURLToPath(session.videoSrc)
          : null;
      if (!source) return null;
      const image = await nativeImage.createThumbnailFromPath(source, { width: 184, height: 104 });
      return image.isEmpty() ? null : image.toDataURL();
    },
    tray: { setQuickSnipState: (state) => options.getTrayManager()?.setQuickSnipState(state) },
    onStateChanged: (state) => {
      for (const target of BrowserWindow.getAllWindows()) target.webContents.send('quick-snip:state-changed', state);
    },
  });
  options.regionOverlay.setRegionChangeListener?.((region, bounds) => controller.updateSelectionRegion(region, bounds));
  applicationIpc.handle('quick-snip:toggle', () => controller.toggle());
  applicationIpc.handle('quick-snip:start', (_event, overrides) => controller.start(overrides));
  applicationIpc.handle('quick-snip:configure', (_event, overrides) => controller.configure(overrides));
  applicationIpc.handle('quick-snip:stop', () => controller.stop());
  applicationIpc.handle('quick-snip:cancel', () => controller.cancel());
  applicationIpc.handle('quick-snip:state', () => controller.state());
  applicationIpc.handle('quick-snip:report', (_event, report) => controller.report(report));
  applicationIpc.handle('quick-snip:copy-file', (_event, file) => copyFile(file));
  applicationIpc.on('quick-snip:status-compact', (_event, compact) => statusWindow.setCompact(Boolean(compact)));
  applicationIpc.on('recording:set-active', (_event, active) => {
    normalRecordingActive = Boolean(active);
  });
  return { controller, cropWindow, statusWindow };
}

module.exports = { createQuickSnipService };
