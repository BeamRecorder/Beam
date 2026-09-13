const { BrowserWindow, screen } = require('electron');
const path = require('path');

function createCountdownWindow({
  applicationRoot,
  isPackaged,
  canAcceptWork = () => true,
  platform = process.platform,
  environment = process.env,
}) {
  let window = null;
  let seconds = null;
  let ready = false;
  let prepared = null;
  let finishPreparation = null;
  const width = 560;
  const height = 256;
  const isWayland =
    platform === 'linux' &&
    (String(environment.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || Boolean(environment.WAYLAND_DISPLAY));
  const position = () => {
    if (isWayland) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    window?.setPosition(
      display.workArea.x + Math.max(0, Math.round((display.workArea.width - width) / 2)),
      display.workArea.y + Math.max(0, Math.round((display.workArea.height - height) / 2)),
    );
  };
  const destroy = () => {
    const target = window;
    window = null;
    seconds = null;
    ready = false;
    finishPreparation?.(false);
    finishPreparation = null;
    prepared = null;
    if (target && !target.isDestroyed()) target.destroy();
  };
  const reveal = () => {
    if (!window || window.isDestroyed()) return;
    // Wayland has no showInactive/moveTop; this surface is always non-focusable.
    if (isWayland) window.show();
    else {
      window.showInactive();
      window.moveTop();
    }
  };
  const prepare = () => {
    if (!canAcceptWork()) return Promise.resolve(false);
    if (window && !window.isDestroyed()) return prepared;
    ready = false;
    prepared = new Promise((resolve) => {
      finishPreparation = resolve;
    });
    const target = new BrowserWindow({
      width,
      height,
      center: isWayland,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    window = target;
    target.setIgnoreMouseEvents(true);
    const failPreparation = () => {
      if (target === window) destroy();
    };
    target.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (code !== -3 && isMainFrame !== false) failPreparation();
    });
    target.webContents.once('did-finish-load', () => {
      if (target !== window || target.isDestroyed()) return;
      ready = true;
      finishPreparation?.(true);
      finishPreparation = null;
      if (seconds === null) return;
      target.webContents.send('countdown:state', seconds);
      position();
      reveal();
    });
    const loading = isPackaged
      ? target.loadFile(path.join(applicationRoot, 'dist/countdown.html'))
      : target.loadURL('http://localhost:6500/countdown.html');
    void Promise.resolve(loading).catch(failPreparation);
    return prepared;
  };
  const show = (value) => {
    if (!canAcceptWork()) return false;
    seconds = value;
    if (value === null) {
      if (window && !window.isDestroyed()) window.hide();
      return true;
    }
    prepare();
    position();
    if (ready) {
      window.webContents.send('countdown:state', value);
      reveal();
    }
    return true;
  };
  prepare();
  return { show, prepare, suspend: destroy, destroy };
}

module.exports = { createCountdownWindow };
