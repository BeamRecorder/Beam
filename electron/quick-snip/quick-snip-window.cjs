const path = require('path');
const { placeCropBar, restoreWindowPosition, saveWindowPosition } = require('./quick-snip-position.cjs');
const { createCommittedWindowPosition } = require('../window/committed-window-position.cjs');

const BAR_SIZE = { width: 480, height: 132 };

function createQuickSnipWindow({
  BrowserWindow,
  applicationRoot,
  isPackaged,
  platform = process.platform,
  appIconPath,
  screen,
  preferencesStore = null,
  environment = process.env,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let window = null;
  let ready = false;
  let rendererReady = false;
  let visibleRequested = false;
  let pendingCommand = null;
  let parentWindow = null;
  let pendingConfiguration = null;
  let baseBounds = null;
  let userPositioned = false;
  let positionTracker = null;
  let activeDisplay = null;
  const send = (channel, payload) => {
    if (window && !window.isDestroyed() && ready && rendererReady) window.webContents.send(channel, payload);
  };
  const present = () => {
    if (!window || window.isDestroyed() || !ready || !rendererReady || !visibleRequested) return;
    if (parentWindow && !parentWindow.isVisible()) return;
    window.showInactive();
    window.moveTop();
  };
  const setParentWindow = (parent) => {
    if (!window || window.isDestroyed()) return false;
    parentWindow?.removeListener('show', present);
    parentWindow?.removeListener('focus', present);
    parentWindow = parent && !parent.isDestroyed() ? parent : null;
    window.setParentWindow(parentWindow);
    parentWindow?.on('show', present);
    parentWindow?.on('focus', present);
    present();
    return true;
  };
  const flushReady = () => {
    if (!ready || !rendererReady) return;
    if (pendingConfiguration) send('quick-snip:configure', pendingConfiguration);
    present();
    if (pendingCommand) {
      send('quick-snip:command', pendingCommand);
      pendingCommand = null;
    }
  };
  const setNativeBounds = (bounds) => {
    if (!window || window.isDestroyed()) return;
    positionTracker?.trackProgrammatic(bounds);
    window.setBounds(bounds);
  };
  const placeForRegion = (region, display) => {
    const placement = placeCropBar({
      displayBounds: display.bounds,
      workArea: display.workArea,
      region,
      barSize: BAR_SIZE,
    });
    if (!userPositioned) {
      baseBounds = { ...placement.bounds };
      setNativeBounds(baseBounds);
    }
    return placement;
  };
  const ensure = (parent) => {
    if (window && !window.isDestroyed()) return window;
    ready = false;
    rendererReady = false;
    window = new BrowserWindow({
      parent,
      ...BAR_SIZE,
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
        backgroundThrottling: false,
      },
    });
    window.setContentProtection(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    const target = window;
    positionTracker = createCommittedWindowPosition({
      window: target,
      platform,
      environment,
      setTimer,
      clearTimer,
      onMove: (bounds) => {
        userPositioned = true;
        baseBounds = bounds;
      },
      onCommit: (bounds) => {
        const display = screen?.getDisplayMatching(bounds) ?? activeDisplay;
        saveWindowPosition(preferencesStore, 'quickSnipBarPositions', display, bounds);
      },
    });
    window.once('ready-to-show', () => {
      if (window !== target || target.isDestroyed()) return;
      ready = true;
      flushReady();
    });
    window.on('closed', () => {
      if (window !== target) return;
      positionTracker?.flush();
      positionTracker?.dispose();
      positionTracker = null;
      parentWindow?.removeListener('show', present);
      parentWindow?.removeListener('focus', present);
      parentWindow = null;
      ready = false;
      rendererReady = false;
      visibleRequested = false;
      pendingCommand = null;
      pendingConfiguration = null;
      window = null;
    });
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { quickSnipCrop: '1' } });
    else window.loadURL('http://localhost:6500/?quickSnipCrop=1');
    return window;
  };
  return {
    show(configuration, display, parent = null) {
      const target = ensure(parent);
      positionTracker.flush();
      activeDisplay = display;
      setParentWindow(parent);
      const nativeIdentity =
        platform === 'darwin'
          ? (target.getMediaSourceId().match(/^window:(\d+)/)?.[1] ?? null)
          : target.getNativeWindowHandle().toString('hex');
      pendingConfiguration = { ...configuration, excludedWindowHandle: nativeIdentity };
      const saved = restoreWindowPosition(preferencesStore, 'quickSnipBarPositions', display, BAR_SIZE);
      userPositioned = Boolean(saved);
      pendingCommand = null;
      visibleRequested = true;
      if (saved) {
        baseBounds = saved;
        setNativeBounds(saved);
      } else if (configuration.screenKind === 'window') {
        const area = display.workArea;
        baseBounds = {
          ...BAR_SIZE,
          x: Math.max(area.x, Math.round(area.x + (area.width - BAR_SIZE.width) / 2)),
          y: Math.max(area.y, area.y + area.height - BAR_SIZE.height - 16),
        };
        setNativeBounds(baseBounds);
      } else {
        placeForRegion(configuration.region, display);
      }
      flushReady();
    },
    rendererReady(sender) {
      if (!window || window.isDestroyed() || window.webContents !== sender) return false;
      rendererReady = true;
      flushReady();
      return true;
    },
    command(command) {
      if (!window || window.isDestroyed()) return;
      if (command === 'start') setParentWindow(null);
      if (ready && rendererReady) send('quick-snip:command', command);
      else pendingCommand = command;
    },
    setRecording() {
      if (!window || window.isDestroyed()) return;
      visibleRequested = true;
      present();
    },
    showExisting() {
      if (!window || window.isDestroyed()) return false;
      visibleRequested = true;
      present();
      return true;
    },
    hide() {
      positionTracker?.flush();
      visibleRequested = false;
      pendingCommand = null;
      pendingConfiguration = null;
      if (window && !window.isDestroyed() && baseBounds) setNativeBounds(baseBounds);
      setParentWindow(null);
      window?.hide();
    },
    setParentWindow,
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
      positionTracker?.flush();
      positionTracker?.dispose();
      window?.destroy();
      window = null;
    },
    owns(sender) {
      return Boolean(window && !window.isDestroyed() && sender === window.webContents);
    },
    nativeHandle() {
      if (!window || window.isDestroyed()) return null;
      return window.getNativeWindowHandle().toString('hex');
    },
  };
}

module.exports = { createQuickSnipWindow };
