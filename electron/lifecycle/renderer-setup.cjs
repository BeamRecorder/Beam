const fs = require('fs');
const path = require('path');
const { HUD_SIZE, WindowController } = require('../window/window-controller.cjs');
const { shouldAutoOpenDevTools } = require('../window/devtools-policy.cjs');
function createRendererSetup({
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  applicationRoot,
  controllers,
  logStartup,
}) {
  function isTrustedRenderer(url) {
    if (url.startsWith('file://')) {
      try {
        const file = require('url').fileURLToPath(url);
        const root = path.resolve(applicationRoot);
        const target = path.resolve(file);
        return target === root || target.startsWith(`${root}${path.sep}`);
      } catch {
        return false;
      }
    }
    try {
      const target = new URL(url);
      return (
        target.origin === 'http://localhost:6500' &&
        [
          '/',
          '/index.html',
          '/countdown.html',
          '/quick-snip-status.html',
          '/editor.html',
          '/teleprompter.html',
          '/onboarding.html',
        ].includes(target.pathname)
      );
    } catch {
      return false;
    }
  }

  function configureMediaPermission() {
    const trusted = (webContents) => Boolean(webContents) && isTrustedRenderer(webContents.getURL());
    const allowed = new Set(['media', 'camera', 'microphone', 'display-capture', 'speaker-selection', 'local-fonts']);
    session.defaultSession.setPermissionCheckHandler(
      (webContents, permission) => trusted(webContents) && allowed.has(permission),
    );
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (!trusted(webContents)) return callback(false);
      callback(allowed.has(permission));
    });
  }

  function configureDesktopLoopback() {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        if (!app.isPackaged)
          logStartup(
            `Desktop loopback request received (${sources.length} screen source${sources.length === 1 ? '' : 's'}).`,
          );
        callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {});
      } catch {
        if (!app.isPackaged) logStartup('Desktop loopback source discovery failed.');
        callback({});
      }
    });
  }

  function getAppIconPath() {
    const extensions = process.platform === 'win32' ? ['ico', 'png'] : ['png', 'ico'];
    const roots = [
      path.join(applicationRoot, 'dist/brand'),
      path.join(applicationRoot, 'public/brand'),
      path.join(applicationRoot, 'dist/brand'),
      path.join(applicationRoot, 'public/brand'),
    ];
    const candidates = roots.flatMap((root) => extensions.map((extension) => path.join(root, `BeamIcon.${extension}`)));
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return path.join(applicationRoot, `public/brand/BeamIcon.${extensions[0]}`);
  }

  function createWindow(preferencesStore, appIconPath) {
    logStartup('Creating BrowserWindow.');
    const win = new BrowserWindow({
      width: HUD_SIZE.width,
      height: HUD_SIZE.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      icon: appIconPath,
      resizable: true,
      maximizable: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    });
    const controller = new WindowController(win, { preferencesStore });
    controllers.set(win, controller);
    // use profileRendererRequests() to see all the requests made by the app and find out why it's slow to launch.
    // profileRendererRequests(win.webContents)
    win.once('ready-to-show', () => {
      logStartup('Window is ready to show (ready-to-show).');
      if (preferencesStore.read().onboardingCompleted) controller.markReadyToShow();
    });
    win.webContents.once('did-start-loading', () => logStartup('Renderer navigation started.'));
    win.webContents.once('dom-ready', () => logStartup('Renderer DOM is ready.'));
    win.webContents.once('did-finish-load', () => logStartup('Renderer loading finished.'));
    if (shouldAutoOpenDevTools({ isPackaged: app.isPackaged })) {
      win.webContents.once('did-finish-load', () => win.webContents.openDevTools({ mode: 'detach' }));
    }
    if (app.isPackaged) {
      logStartup('Loading dist/index.html.');
      win.loadFile(path.join(applicationRoot, 'dist/index.html'));
    } else {
      logStartup('Loading http://localhost:6500.');
      win.loadURL('http://localhost:6500');
    }
    return win;
  }

  return { isTrustedRenderer, configureMediaPermission, configureDesktopLoopback, getAppIconPath, createWindow };
}
module.exports = { createRendererSetup };
