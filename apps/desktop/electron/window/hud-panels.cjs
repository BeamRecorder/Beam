const path = require('node:path');
const { developmentRendererUrl } = require('../lifecycle/development-session.cjs');
const { BrowserWindow } = require('electron');
const { enforceDefaultZoom, installBrowserZoomPolicy } = require('./browser-zoom-policy.cjs');
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PANEL_SIZES = {
  settings: { width: 720, height: 680, minWidth: 580, minHeight: 480 },
  projects: { width: 720, height: 560, minWidth: 560, minHeight: 440 },
  mascot: { width: 1280, height: 900, minWidth: 960, minHeight: 640 },
};
const PANEL_TITLES = {
  settings: 'Beam Settings',
  projects: 'Beam Projects',
  mascot: 'Beam Mascot Lab',
};

function createHudPanelManager({
  applicationRoot,
  appIconPath,
  isPackaged,
  ipcMain,
  hudWindow,
  hudController,
  canAcceptWork,
  captureWarmup = Promise.resolve(),
}) {
  const panels = new Map();
  let disposed = false;
  let warmupComplete = false;
  const synchronizeTopmost = (panel) => {
    const topmost =
      panel.requested && panel.window.isVisible() && !panel.window.isMinimized() && hudWindow.isAlwaysOnTop();
    if (panel.topmost === topmost) return;
    panel.topmost = topmost;
    panel.window.setAlwaysOnTop(topmost, process.platform === 'win32' ? 'screen-saver' : 'normal');
  };
  const dismiss = (panel) => {
    panel.requested = false;
    panel.activated = false;
    panel.rendererReady = false;
    panel.window.webContents.send('hud-panel:visibility', false);
    panel.window.hide();
    synchronizeTopmost(panel);
  };
  const owns = (sender, role) => panels.get(role)?.window.webContents === sender;
  const available = () => canAcceptWork() && !hudWindow.isDestroyed() && hudController.mode === 'hud';
  const present = (panel) => {
    if (!panel.requested || !panel.nativeReady || !panel.rendererReady || panel.window.isDestroyed()) return;
    if (!canAcceptWork() || (panel.role !== 'mascot' && !available())) {
      panel.fail(new Error('The recorder is not available.'));
      return;
    }
    enforceDefaultZoom(panel.window.webContents);
    if (panel.window.isMinimized()) panel.window.restore();
    panel.window.show();
    synchronizeTopmost(panel);
    panel.window.focus();
    panel.window.moveTop();
    clearTimeout(panel.timer);
    panel.resolve(true);
  };
  const activate = (panel) => {
    if (panel.window.isDestroyed() || !panel.shellReady || !panel.nativeReady) return;
    clearTimeout(panel.preparationTimer);
    panel.resolvePrepared();
    panel.window.webContents.setBackgroundThrottling(true);
    if (!panel.requested || panel.activated) return;
    panel.activated = true;
    panel.window.webContents.send('hud-panel:visibility', true);
  };
  const create = (role) => {
    const window = new BrowserWindow({
      ...PANEL_SIZES[role],
      title: PANEL_TITLES[role],
      icon: appIconPath,
      show: false,
      transparent: false,
      backgroundColor: '#212123',
      ...(role === 'projects'
        ? { frame: false }
        : {
            titleBarStyle: 'hidden',
            titleBarOverlay: {
              color: '#00000000',
              symbolColor: '#808080',
              height: role === 'settings' ? 38 : 40,
            },
            ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
          }),
      thickFrame: true,
      resizable: true,
      hasShadow: true,
      webPreferences: {
        additionalArguments: isPackaged ? ['--beam-installed'] : [],
        preload: path.join(applicationRoot, 'apps/desktop/electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        zoomFactor: 1,
        backgroundThrottling: false,
      },
    });
    const panel = {
      window,
      role,
      nativeReady: false,
      shellReady: false,
      rendererReady: false,
      requested: false,
      activated: false,
    };
    panel.prepared = new Promise((resolve, reject) => {
      panel.resolvePrepared = resolve;
      panel.rejectPrepared = reject;
    });
    // Preparation can fail before a user has requested this window.
    panel.prepared.catch(() => {});
    panels.set(role, panel);
    const fail = (error) => {
      panel.rejectPrepared(error);
      panel.reject?.(error);
      if (!window.isDestroyed()) window.destroy();
    };
    panel.fail = fail;
    panel.preparationTimer = setTimeout(() => fail(new Error('The window did not finish loading.')), 30_000);
    installBrowserZoomPolicy(window.webContents, { resetOnLoad: false });
    if (role === 'projects') {
      // Own this shortcut before renderer inputs or application menus can consume it.
      window.webContents.on('before-input-event', (event, input) => {
        if (
          input.type === 'keyDown' &&
          (input.control || input.meta) &&
          !input.alt &&
          !input.shift &&
          input.key.toLowerCase() === 'w' &&
          !window.isDestroyed()
        ) {
          event.preventDefault();
          window.close();
        }
      });
    }
    window.once('ready-to-show', () => {
      panel.nativeReady = true;
      activate(panel);
    });
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame) fail(new Error(`Could not load the window (${code}): ${description}`));
    });
    window.webContents.on('render-process-gone', () => fail(new Error('The window renderer stopped.')));
    window.on('unresponsive', () => fail(new Error('The window renderer is unresponsive.')));
    window.on('close', (event) => {
      if (disposed || role === 'mascot' || !panel.rendererReady || !panel.requested || !canAcceptWork()) return;
      event.preventDefault();
      dismiss(panel);
    });
    window.on('focus', () => {
      synchronizeTopmost(panel);
      if (panel.topmost) window.moveTop();
    });
    window.on('minimize', () => synchronizeTopmost(panel));
    window.on('restore', () => synchronizeTopmost(panel));
    window.on('closed', () => {
      clearTimeout(panel.timer);
      clearTimeout(panel.preparationTimer);
      panel.rejectPrepared(new Error('The window was closed.'));
      panel.reject?.(new Error('The window was closed.'));
      if (panels.get(role) === panel) panels.delete(role);
    });
    const loading = isPackaged
      ? window.loadFile(path.join(applicationRoot, 'dist/html/hud-panel.html'), { query: { panel: role } })
      : window.loadURL(developmentRendererUrl(`hud-panel.html?panel=${role}`));
    Promise.resolve(loading).catch(fail);
    return panel;
  };
  const open = (role, sender) => {
    if (disposed) throw new Error('The recorder is not available.');
    if (role === 'mascot') {
      if (isPackaged || !canAcceptWork() || !owns(sender, 'settings') || !panels.get('settings').requested)
        throw new Error('Developer tools are not available.');
    } else if (sender !== hudWindow.webContents || !available()) throw new Error('The recorder is not available.');
    const panel = panels.get(role) || create(role);
    if (!panel.requested) {
      panel.requested = true;
      panel.ready = new Promise((resolve, reject) => {
        panel.resolve = resolve;
        panel.reject = reject;
      });
      panel.timer = setTimeout(() => panel.fail(new Error('The window did not finish loading.')), 30_000);
      activate(panel);
    } else present(panel);
    return panel.ready;
  };
  const prepare = () => {
    if (disposed || !available() || !hudWindow.isVisible()) return Promise.resolve();
    return Promise.all(['settings', 'projects'].map((role) => (panels.get(role) || create(role)).prepared));
  };
  const warm = () => {
    if (warmupComplete) void prepare().catch((error) => console.error('[HUD panels] Preparation failed:', error));
  };
  const hideOwnedPanels = () => {
    for (const panel of panels.values()) {
      if (panel.role === 'mascot' || !panel.requested) continue;
      if (panel.rendererReady) dismiss(panel);
      else panel.fail(new Error('The recorder is not available.'));
    }
  };
  const updateTopmost = () => {
    for (const panel of panels.values()) synchronizeTopmost(panel);
  };
  hudWindow.on('show', warm);
  hudWindow.on('hide', hideOwnedPanels);
  hudWindow.on('always-on-top-changed', updateTopmost);
  Promise.resolve(captureWarmup)
    .catch(() => {})
    .then(() => {
      warmupComplete = true;
      warm();
    });

  ipcMain.handle('hud:open-settings', (event) => open('settings', event.sender));
  ipcMain.handle('hud:open-projects', (event) => open('projects', event.sender));
  if (!isPackaged) {
    ipcMain.handle('developer:open-mascot-lab', (event) => open('mascot', event.sender));
    ipcMain.handle('developer:open-devtools', (event) => {
      const window = panels.get('settings')?.window;
      if (
        !canAcceptWork() ||
        !owns(event.sender, 'settings') ||
        !panels.get('settings').requested ||
        !window ||
        window.isDestroyed()
      )
        throw new Error('Developer tools are not available.');
      window.webContents.openDevTools({ mode: 'detach' });
    });
  }
  ipcMain.on('hud-panel:prepared', (event) => {
    for (const panel of panels.values()) {
      if (panel.window.webContents !== event.sender) continue;
      panel.shellReady = true;
      activate(panel);
    }
  });
  ipcMain.on('hud-panel:ready', (event) => {
    for (const panel of panels.values()) {
      if (panel.window.webContents !== event.sender || !panel.requested || !panel.activated) continue;
      panel.rendererReady = true;
      present(panel);
    }
  });
  ipcMain.handle('hud-panel:open-project', (event, request) => {
    if (!owns(event.sender, 'projects') || !panels.get('projects').requested || !available())
      throw new Error('The project library is not available.');
    if (
      !request ||
      typeof request.id !== 'string' ||
      !PROJECT_ID.test(request.id) ||
      !['studio', 'instant', 'screenshot'].includes(request.mode)
    )
      throw new Error('Invalid project selection.');
    hudWindow.webContents.send('hud:open-project', {
      id: request.id,
      mode: request.mode,
    });
    panels.get('projects').window.close();
    return true;
  });
  return {
    prepare,
    destroy() {
      disposed = true;
      hudWindow.removeListener('show', warm);
      hudWindow.removeListener('hide', hideOwnedPanels);
      hudWindow.removeListener('always-on-top-changed', updateTopmost);
      for (const panel of panels.values()) {
        if (!panel.window.isDestroyed()) panel.window.destroy();
      }
      panels.clear();
    },
  };
}

module.exports = { createHudPanelManager };
