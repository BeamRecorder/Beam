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
  const size = 192;
  const isWayland =
    platform === 'linux' &&
    (String(environment.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland' || Boolean(environment.WAYLAND_DISPLAY));
  const position = () => {
    if (isWayland) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    window?.setPosition(
      display.workArea.x + Math.round((display.workArea.width - size) / 2),
      display.workArea.y + Math.round((display.workArea.height - size) / 2),
    );
  };
  const create = () => {
    if (!canAcceptWork()) return;
    if (window && !window.isDestroyed()) return;
    if (!window || window.isDestroyed()) {
      ready = false;
      window = new BrowserWindow({
        width: size,
        height: size,
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
      window.setIgnoreMouseEvents(true);
      window.webContents.once('did-fail-load', () => {
        ready = false;
        if (window && !window.isDestroyed()) window.destroy();
        window = null;
      });
      window.webContents.once('did-finish-load', () => {
        ready = true;
        if (seconds === null) return;
        window?.webContents.send('countdown:state', seconds);
        position();
        reveal();
      });
      if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { countdown: '1' } });
      else window.loadURL('http://localhost:6500/?countdown=1');
    }
  };
  const reveal = () => {
    if (!window || window.isDestroyed()) return;
    if (isWayland) {
      // showInactive() and moveTop() are not supported by Electron on
      // Wayland. The window remains non-focusable, so show() presents it
      // without taking focus from the recording target.
      window.show();
      return;
    }
    window.showInactive();
    window.moveTop();
  };
  const show = (value) => {
    if (!canAcceptWork()) return false;
    seconds = value;
    create();
    if (value === null) {
      window?.hide();
      return true;
    }
    position();
    if (ready) {
      window.webContents.send('countdown:state', value);
      reveal();
    }
    return true;
  };
  // Load the renderer while the application is idle. The first countdown
  // value can then be displayed immediately instead of waiting for a cold
  // BrowserWindow and renderer navigation.
  create();
  return {
    show,
    destroy: () => {
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
      ready = false;
    },
  };
}

module.exports = { createCountdownWindow };
