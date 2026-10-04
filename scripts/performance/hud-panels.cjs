// Real Electron windows with isolated preferences and a deterministic catalogue.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

if (process.platform !== 'linux' || !process.argv.includes('--ozone-platform=x11')) {
  throw new Error('Run this Linux window benchmark with --ozone-platform=x11 on the Electron command line.');
}
const root = path.resolve(__dirname, '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-panel-profile-'));
const output = process.env.BEAM_PANEL_OUTPUT || path.join(temporary, 'results.json');
app.setPath('userData', path.join(temporary, 'chromium'));
if (process.env.BEAM_PANEL_SOFTWARE === '1') app.disableHardwareAcceleration();

const { defaults } = require('../../apps/desktop/electron/preferences/preferences-store.cjs');
const preferences = defaults();
preferences.extras.locale = 'fr';
const managerPath = path.join(root, 'apps/desktop/electron/window/hud-panels.cjs');
const managerModule = new Module(managerPath, module);
managerModule.filename = managerPath;
managerModule.paths = Module._nodeModulePaths(path.dirname(managerPath));
managerModule._compile(fs.readFileSync(process.env.BEAM_PANEL_BASELINE || managerPath, 'utf8'), managerPath);
const handlers = new Map();
const ipc = {
  handle(name, handler) {
    handlers.set(name, handler);
    ipcMain.handle(name, handler);
  },
  on(name, handler) {
    ipcMain.on(name, handler);
  },
};
const projects = Array.from({ length: 30 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: `Project ${index}`,
  mode: 'studio',
  sessionCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  thumbnailSrc:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4bkAAAAASUVORK5CYII=',
  previewSrc: null,
}));
ipcMain.handle('preferences:get', () => preferences);
ipcMain.handle('input-access:status', () => ({
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
}));
ipcMain.handle('projects:list', () => projects);
ipcMain.on('window:close', ({ sender }) => BrowserWindow.fromWebContents(sender)?.close());
app.on('browser-window-created', (_, window) => {
  if (!process.env.BEAM_PANEL_DIST) return;
  const loadFile = window.loadFile.bind(window);
  window.loadFile = (file, options) =>
    loadFile(path.join(process.env.BEAM_PANEL_DIST, 'html', path.basename(file)), options);
});

app
  .whenReady()
  .then(async () => {
    app.on('window-all-closed', () => {});
    const hud = new BrowserWindow({
      width: 672,
      height: 268,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      show: false,
    });
    await hud.loadURL('data:text/html,<body>Beam panel benchmark</body>');
    hud.show();
    const manager = managerModule.exports.createHudPanelManager({
      applicationRoot: root,
      isPackaged: true,
      ipcMain: ipc,
      hudWindow: hud,
      hudController: { mode: 'hud' },
      canAcceptWork: () => true,
    });
    const results = [];
    const findPanel = (role) =>
      BrowserWindow.getAllWindows().find(
        (window) => window !== hud && window.webContents.getURL().includes(`panel=${role}`),
      );
    try {
      for (let iteration = 0; iteration < 3; iteration++) {
        for (const role of ['settings', 'projects']) {
          const preparationStarted = performance.now();
          if (!process.env.BEAM_PANEL_BASELINE) await manager.prepare();
          const preparationMs = performance.now() - preparationStarted;
          const started = performance.now();
          await handlers.get(`hud:open-${role}`)({ sender: hud.webContents });
          const window = findPanel(role);
          const firstMs = performance.now() - started;
          const closed = new Promise((resolve) =>
            window.once(process.env.BEAM_PANEL_BASELINE ? 'closed' : 'hide', resolve),
          );
          window.close();
          await closed;
          const beforeReopen = performance.now();
          await handlers.get(`hud:open-${role}`)({ sender: hud.webContents });
          const current = findPanel(role);
          const reopenedMs = performance.now() - beforeReopen;
          // Window-manager settling and assertions are outside measured latency.
          await new Promise((resolve) => setTimeout(resolve, 100));
          const stack =
            execFileSync('xprop', ['-root', '_NET_CLIENT_LIST_STACKING'], { encoding: 'utf8' })
              .match(/0x[0-9a-f]+/g)
              ?.map((value) => Number.parseInt(value, 16)) ?? [];
          const hudXid = hud.getNativeWindowHandle().readUInt32LE();
          const panelXid = current.getNativeWindowHandle().readUInt32LE();
          results.push({
            role,
            iteration,
            preparationMs,
            firstMs,
            reopenedMs,
            reused: window === current,
            topmost: current.isAlwaysOnTop(),
            hudXid,
            panelXid,
            stack,
            aboveHud:
              stack.includes(hudXid) && stack.includes(panelXid) && stack.indexOf(panelXid) > stack.indexOf(hudXid),
            content: await current.webContents.executeJavaScript(
              'document.querySelector(".settings-window, .project-grid, .project-card-container") !== null',
            ),
            startupAvailable: await current.webContents.executeJavaScript('window.capture.canLaunchAtStartup'),
          });
          current.destroy();
        }
      }
      fs.writeFileSync(output, JSON.stringify(results, null, 2));
      console.log(`Panel measurements: ${output}`);
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      manager.destroy();
      hud.destroy();
      app.quit();
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
setTimeout(() => {
  console.error('Panel benchmark exceeded 45 seconds.');
  app.exit(1);
}, 45_000).unref();
