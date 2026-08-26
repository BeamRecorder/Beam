const path = require('path');
const { placeCropBar } = require('./quick-snip-position.cjs');

const BAR_SIZE = { width: 760, height: 84 };

function createQuickSnipWindow({
  BrowserWindow,
  applicationRoot,
  isPackaged,
  platform = process.platform,
  appIconPath,
}) {
  let window = null;
  let ready = false;
  let pendingConfiguration = null;
  let hideWhileRecording = false;
  let baseBounds = null;
  let userPositioned = false;
  let programmaticBounds = null;
  const send = (channel, payload) => {
    if (window && !window.isDestroyed() && ready) window.webContents.send(channel, payload);
  };
  const setNativeBounds = (bounds) => {
    if (!window || window.isDestroyed()) return;
    programmaticBounds = { ...bounds };
    window.setBounds(bounds);
  };
  const placeForRegion = (region, display) => {
    const placement = placeCropBar({
      displayBounds: display.bounds,
      workArea: display.workArea,
      region,
      barSize: BAR_SIZE,
    });
    hideWhileRecording = platform === 'linux' && !placement.outside;
    if (!userPositioned) {
      baseBounds = { ...placement.bounds };
      setNativeBounds(baseBounds);
    }
    return placement;
  };
  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    ready = false;
    window = new BrowserWindow({
      width: 760,
      height: 84,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      focusable: true,
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
    window.setAlwaysOnTop(true, 'screen-saver');
    window.once('ready-to-show', () => {
      ready = true;
      if (pendingConfiguration) send('quick-snip:configure', pendingConfiguration);
    });
    window.on('closed', () => {
      ready = false;
      window = null;
    });
    window.on('moved', () => {
      if (!window || window.isDestroyed()) return;
      const bounds = window.getBounds();
      if (
        programmaticBounds &&
        bounds.x === programmaticBounds.x &&
        bounds.y === programmaticBounds.y &&
        bounds.width === programmaticBounds.width &&
        bounds.height === programmaticBounds.height
      ) {
        programmaticBounds = null;
        return;
      }
      userPositioned = true;
      baseBounds = { ...bounds };
    });
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { quickSnipCrop: '1' } });
    else window.loadURL('http://localhost:6500/?quickSnipCrop=1');
    return window;
  };
  return {
    show(configuration, display) {
      const target = ensure();
      const nativeIdentity =
        platform === 'darwin'
          ? (target.getMediaSourceId().match(/^window:(\d+)/)?.[1] ?? null)
          : target.getNativeWindowHandle().toString('hex');
      pendingConfiguration = { ...configuration, excludedWindowHandle: nativeIdentity };
      userPositioned = false;
      placeForRegion(configuration.region, display);
      send('quick-snip:configure', { ...pendingConfiguration, hideWhileRecording });
      target.showInactive();
      target.moveTop();
    },
    command(command) {
      if (command === 'start') window?.setParentWindow(null);
      send('quick-snip:command', command);
      if (command === 'start' && hideWhileRecording) window?.hide();
    },
    setRecording(recording) {
      if (!window || window.isDestroyed()) return;
      if (recording && hideWhileRecording) window.hide();
      else {
        window.showInactive();
        window.moveTop();
      }
    },
    showExisting() {
      if (!window || window.isDestroyed()) return false;
      window.showInactive();
      window.moveTop();
      return true;
    },
    hide() {
      if (window && !window.isDestroyed() && baseBounds) setNativeBounds(baseBounds);
      window?.setParentWindow(null);
      window?.hide();
    },
    setParentWindow(parent) {
      if (!window || window.isDestroyed()) return false;
      window.setParentWindow(parent && !parent.isDestroyed?.() ? parent : null);
      return true;
    },
    updateRegion(region, display) {
      if (!window || window.isDestroyed() || !baseBounds) return false;
      placeForRegion(region, display);
      return true;
    },
    updateConfiguration(configuration) {
      if (!window || window.isDestroyed()) return false;
      pendingConfiguration = { ...pendingConfiguration, ...configuration };
      send('quick-snip:configure', pendingConfiguration);
      return true;
    },
    destroy() {
      window?.destroy();
      window = null;
    },
    nativeHandle() {
      if (!window || window.isDestroyed()) return null;
      return window.getNativeWindowHandle().toString('hex');
    },
  };
}

module.exports = { createQuickSnipWindow };
