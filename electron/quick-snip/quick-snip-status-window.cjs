const path = require('path');

function createQuickSnipStatusWindow({ BrowserWindow, applicationRoot, isPackaged, screen, appIconPath }) {
  let window = null;
  let ready = false;
  let current = null;
  const send = () => {
    if (window && !window.isDestroyed() && ready && current) window.webContents.send('quick-snip:status', current);
  };
  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    ready = false;
    window = new BrowserWindow({
      width: 380,
      height: 184,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      hasShadow: false,
      icon: appIconPath,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    window.setContentProtection(true);
    window.once('ready-to-show', () => {
      ready = true;
      send();
    });
    window.on('closed', () => {
      window = null;
      ready = false;
    });
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { quickSnipStatus: '1' } });
    else window.loadURL('http://localhost:6500/?quickSnipStatus=1');
    return window;
  };
  const place = (target) => {
    const regionBounds = current?.job?.regionBounds;
    const display =
      (regionBounds && typeof screen.getDisplayMatching === 'function' && screen.getDisplayMatching(regionBounds)) ||
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
      screen.getPrimaryDisplay();
    const area = display.workArea;
    const [width, height] = target.getSize();
    target.setPosition(area.x + area.width - width - 16, area.y + area.height - height - 16);
  };
  return {
    update(status) {
      current = status;
      const target = ensure();
      place(target);
      send();
      target.showInactive();
      target.moveTop();
    },
    show() {
      if (!window || window.isDestroyed()) return false;
      place(window);
      send();
      window.showInactive();
      return true;
    },
    hide() {
      window?.destroy();
      window = null;
      ready = false;
      current = null;
    },
    setCompact(compact) {
      if (!window || window.isDestroyed()) return;
      window.setSize(380, compact ? 72 : 184);
      place(window);
    },
    destroy() {
      window?.destroy();
      window = null;
    },
  };
}

module.exports = { createQuickSnipStatusWindow };
