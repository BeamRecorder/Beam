const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { createFileClipboard } = require('../clipboard/file-clipboard.cjs');
const { registerQuickSnipDeviceMenu } = require('./quick-snip-device-menu.cjs');
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
  let deviceMenu = null;
  const cropWindow = createQuickSnipWindow(options);
  const statusWindow = createQuickSnipStatusWindow(options);
  const renderer = createQuickSnipRenderer({ applicationIpc, statusWindow });
  const fileClipboard = createFileClipboard({ platform, clipboard });
  const requireOutputFile = (file) => {
    const target = fs.realpathSync(path.resolve(String(file || '')));
    const roots = [userPaths.instantProjects].map((root) => path.resolve(root));
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
    screenshotPresetStore: options.screenshotPresetStore,
    screenshotStore: options.screenshotStore,
    openEditor: options.openEditor,
    openScreenshot: options.openScreenshot,
    projectStore: options.projectStore,
    regionOverlay: options.regionOverlay,
    cropWindow,
    statusWindow,
    resolveScreenId: async (display) => {
      if (platform === 'darwin') return `sck:display:${display.id}`;
      const point = screen.dipToScreenPoint({
        x: Math.round(display.bounds.x + display.bounds.width / 2),
        y: Math.round(display.bounds.y + display.bounds.height / 2),
      });
      return options.captureEngine.request('resolve-display', point);
    },
    resolveDisplay: (displayId) =>
      screen.getAllDisplays().find((display) => String(display.id) === String(displayId)) ||
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
      screen.getPrimaryDisplay(),
    isNormalRecordingActive: () => normalRecordingActive || options.isScreenshotBusy?.(),
    finalize: createQuickSnipFinalizer({
      projectStore: options.projectStore,
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
      if (state.state !== 'selecting') deviceMenu?.close();
      for (const target of BrowserWindow.getAllWindows()) target.webContents.send('quick-snip:state-changed', state);
    },
  });
  deviceMenu = registerQuickSnipDeviceMenu({ applicationIpc, BrowserWindow, cropWindow, controller });
  options.regionOverlay.setRegionChangeListener?.((region, bounds) => controller.updateSelectionRegion(region, bounds));
  applicationIpc.handle('quick-snip:from-hud', (_event, options) => controller.fromHud(options));
  applicationIpc.handle('quick-snip:toggle', () => controller.toggle());
  applicationIpc.on('quick-snip:status-ready', (event) => statusWindow.rendererReady(event.sender));
  applicationIpc.on('quick-snip:crop-ready', (event) => cropWindow.rendererReady(event.sender));
  applicationIpc.handle('quick-snip:start', (_event, overrides) => controller.start(overrides));
  applicationIpc.handle('quick-snip:configure', (_event, overrides) => controller.configure(overrides));
  applicationIpc.handle('quick-snip:stop', () => controller.stop());
  applicationIpc.handle('quick-snip:cancel', () => controller.cancel());
  applicationIpc.handle('quick-snip:state', (event) =>
    statusWindow.owns(event.sender) ? (statusWindow.snapshot() ?? controller.state()) : controller.state(),
  );
  applicationIpc.handle('quick-snip:report', (event, report) => {
    if (
      ['capture-cancelled', 'screenshot-captured', 'screenshot-rendered', 'screenshot'].includes(report?.type) &&
      !cropWindow.owns(event.sender)
    )
      throw new Error('Quick Snip capture cancellation sender is not authorized.');
    return controller.report(report);
  });
  applicationIpc.handle('quick-snip:open-editor', async (event) => {
    if (!statusWindow.owns(event.sender)) throw new Error('Quick Snip status sender is not authorized.');
    const state = controller.state();
    const projectId = state.result?.projectId ?? state.job?.projectId;
    if (!projectId) throw new Error('No retained Quick Snip project.');
    if (!['completed', 'failed'].includes(state.state)) await controller.cancel({ keepStatus: true });
    if (state.job.mode === 'screenshot') await options.openScreenshot(projectId);
    else await options.openEditor(projectId);
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
  const prepareScreenshot = async (event) => {
    if (!cropWindow.owns(event.sender)) return;
    const target = BrowserWindow.fromWebContents(event.sender);
    target.hide();
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (target.isDestroyed() || target.isVisible()) throw new Error('Unable to hide the Quick Snip bar for capture.');
  };
  return {
    prepareScreenshot,
    controller,
    cropWindow,
    statusWindow,
    exportDestination: renderer.destination,
    isNormalRecordingActive: () => normalRecordingActive,
  };
}

module.exports = { createQuickSnipService };
