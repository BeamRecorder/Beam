const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { createFileClipboard } = require('../clipboard/file-clipboard.cjs');
const { createQuickSnipController } = require('./quick-snip-controller.cjs');
const { createQuickSnipWindow } = require('./quick-snip-window.cjs');
const { createQuickSnipStatusWindow } = require('./quick-snip-status-window.cjs');
const { createQuickSnipRenderer } = require('./quick-snip-renderer.cjs');
const { createQuickSnipFinalizer } = require('./quick-snip-finalizer.cjs');

function createQuickSnipService(options) {
  const {
    BrowserWindow,
    applicationIpc,
    userPaths,
    screen,
    nativeImage,
    clipboard,
    platform = process.platform,
  } = options;
  let normalRecordingActive = false;
  const cropWindow = createQuickSnipWindow(options);
  const statusWindow = createQuickSnipStatusWindow(options);
  const renderer = createQuickSnipRenderer({ applicationIpc, statusWindow });
  const fileClipboard = createFileClipboard({ platform, clipboard });
  const requireOutputFile = (file) => {
    const target = path.resolve(String(file || ''));
    const roots = [userPaths.quickSnipStudio, userPaths.quickSnipRaw].map((root) => path.resolve(root));
    if (!roots.some((root) => target.startsWith(`${root}${path.sep}`)) || !fs.statSync(target).isFile())
      throw new Error('Quick Snip clipboard path is invalid.');
    return target;
  };
  const copyFile = (file) => fileClipboard.copyFile(requireOutputFile(file));
  const controller = createQuickSnipController({
    platform,
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
    finalize: createQuickSnipFinalizer({
      userPaths,
      projectStore: options.projectStore,
      rawProjectStore: options.rawProjectStore,
      render: renderer.render,
    }),
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
  applicationIpc.on('quick-snip:crop-ready', (event) => cropWindow.rendererReady(event.sender));
  applicationIpc.handle('quick-snip:start', (_event, overrides) => controller.start(overrides));
  applicationIpc.handle('quick-snip:configure', (_event, overrides) => controller.configure(overrides));
  applicationIpc.handle('quick-snip:stop', () => controller.stop());
  applicationIpc.handle('quick-snip:cancel', () => controller.cancel());
  applicationIpc.handle('quick-snip:state', (event) =>
    statusWindow.owns(event.sender) ? (statusWindow.snapshot() ?? controller.state()) : controller.state(),
  );
  applicationIpc.handle('quick-snip:report', (_event, report) => controller.report(report));
  applicationIpc.handle('quick-snip:open-editor', async (event) => {
    if (!statusWindow.owns(event.sender)) throw new Error('Quick Snip status sender is not authorized.');
    const state = controller.state();
    const projectId = state.result?.projectId ?? state.job?.projectId;
    if (state.job?.mode !== 'studio' || !projectId) throw new Error('No retained Quick Snip project.');
    if (!['completed', 'failed'].includes(state.state)) await controller.cancel({ keepStatus: true });
    await options.openEditor(projectId);
    if (statusWindow.owns(event.sender)) statusWindow.hide();
  });
  applicationIpc.handle('quick-snip:copy-file', (_event, file) => copyFile(file));
  applicationIpc.on('quick-snip:status-interactive', (event, value) => {
    if (statusWindow.owns(event.sender) && typeof value === 'boolean') statusWindow.setInteractive(value);
  });
  applicationIpc.on('quick-snip:status-dismiss', (event) => {
    if (statusWindow.owns(event.sender) && ['completed', 'failed'].includes(controller.state().state))
      statusWindow.hide();
  });
  applicationIpc.on('recording:set-active', (_event, active) => {
    normalRecordingActive = Boolean(active);
  });
  return { controller, cropWindow, statusWindow, exportDestination: renderer.destination };
}

module.exports = { createQuickSnipService };
