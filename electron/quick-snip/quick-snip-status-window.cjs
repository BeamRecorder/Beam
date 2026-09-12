const path = require('path');
const { createCommittedWindowPosition } = require('../window/committed-window-position.cjs');
const {
  STATUS_SIZE,
  PILL_SIZE,
  placeStatusPill,
  statusPillPosition,
  restoreWindowPosition,
  saveWindowPosition,
} = require('./quick-snip-position.cjs');

const COMPLETED_VISIBLE_MS = 5_000;

function createQuickSnipStatusWindow({
  BrowserWindow,
  applicationRoot,
  isPackaged,
  screen,
  appIconPath,
  cleanupStatus = () => {},
  platform = process.platform,
  environment = process.env,
  preferencesStore = null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let window = null;
  let ready = false;
  let current = null;
  let renderTask = null;
  let renderFailure = null;
  let interactive = false;
  let closeTimer = null;
  let positionTracker = null;
  let popoverSide = 'above';
  const clearClose = () => {
    if (closeTimer !== null) clearTimer(closeTimer);
    closeTimer = null;
  };
  const hide = () => {
    positionTracker?.flush();
    positionTracker?.dispose();
    positionTracker = null;
    clearClose();
    const previous = window;
    window = null;
    current = null;
    renderTask = null;
    ready = false;
    interactive = false;
    if (previous && !previous.isDestroyed()) previous.destroy();
  };
  const scheduleClose = () => {
    clearClose();
    if (current?.state === 'completed' && !interactive) closeTimer = setTimer(hide, COMPLETED_VISIBLE_MS);
  };
  const snapshot = () => (current ? { ...current, popoverSide } : null);
  const send = () => {
    if (window && !window.isDestroyed() && ready && current) window.webContents.send('quick-snip:status', snapshot());
  };
  const placePill = (target, position, display) => {
    const placement = placeStatusPill({ position, workArea: display.workArea });
    popoverSide = placement.popoverSide;
    const bounds = target.getBounds();
    if (bounds.x !== placement.bounds.x || bounds.y !== placement.bounds.y) {
      positionTracker.trackProgrammatic(placement.bounds);
      target.setPosition(placement.bounds.x, placement.bounds.y);
    }
    return placement.position;
  };
  const place = (target) => {
    const regionBounds = current?.job?.regionBounds;
    const display =
      (regionBounds && screen.getDisplayMatching(regionBounds)) ||
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
      screen.getPrimaryDisplay();
    const area = display.workArea;
    const saved = restoreWindowPosition(preferencesStore, 'quickSnipStatusPositions', display, PILL_SIZE);
    placePill(
      target,
      saved ?? { x: area.x + area.width - PILL_SIZE.width - 28, y: area.y + area.height - PILL_SIZE.height - 28 },
      display,
    );
  };
  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    ready = false;
    const target = new BrowserWindow({
      ...STATUS_SIZE,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      maximizable: false,
      minimizable: false,
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
        zoomFactor: 1,
        backgroundThrottling: false,
      },
    });
    window = target;
    popoverSide = 'above';
    const contents = target.webContents;
    positionTracker = createCommittedWindowPosition({
      window: target,
      platform,
      environment,
      setTimer,
      clearTimer,
      onMove: clearClose,
      onCommit: (bounds) => {
        let position = statusPillPosition(bounds, popoverSide);
        const display = screen.getDisplayMatching({ ...position, ...PILL_SIZE });
        if (!target.isDestroyed()) position = placePill(target, position, display);
        saveWindowPosition(preferencesStore, 'quickSnipStatusPositions', display, position);
        send();
        scheduleClose();
      },
    });
    target.setContentProtection(true);
    // BrowserWindow.webContents throws once the native window has been destroyed.
    contents.once('destroyed', () => cleanupStatus(contents));
    if (platform !== 'linux') target.setIgnoreMouseEvents(true, { forward: true });
    contents.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && ['+', '-', '=', '0'].includes(input.key)) event.preventDefault();
    });
    target.once('ready-to-show', () => {
      if (window !== target || target.isDestroyed()) return;
      ready = true;
      contents.setZoomFactor(1);
      place(target);
      send();
      if (renderTask) contents.send('quick-snip:render-task', renderTask);
      target.showInactive();
      scheduleClose();
    });
    const failed = () => {
      if (window !== target) return;
      hide();
      renderFailure?.(new Error('Quick Snip render window closed unexpectedly.'));
    };
    target.on('closed', failed);
    contents.on('render-process-gone', failed);
    contents.on('did-fail-load', failed);
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { quickSnipStatus: '1' } });
    else target.loadURL('http://localhost:6500/?quickSnipStatus=1');
    return target;
  };
  return {
    snapshot,
    update(status) {
      const previousState = current?.state;
      current = status;
      ensure();
      send();
      if (ready && previousState !== status.state) scheduleClose();
    },
    show() {
      if (!window || window.isDestroyed()) return false;
      if (!ready) return true;
      send();
      window.showInactive();
      scheduleClose();
      return true;
    },
    setInteractive(value) {
      if (!window || interactive === value) return;
      interactive = value;
      if (platform !== 'linux') window.setIgnoreMouseEvents(!value, { forward: true });
      scheduleClose();
    },
    onRenderFailure(listener) {
      renderFailure = listener;
    },
    setRenderTask(task) {
      renderTask = task;
      if (ready && window && !window.isDestroyed()) window.webContents.send('quick-snip:render-task', task);
    },
    owns(sender) {
      return Boolean(window && !window.isDestroyed() && window.webContents === sender);
    },
    hide,
    destroy: hide,
  };
}

module.exports = { createQuickSnipStatusWindow, STATUS_SIZE, COMPLETED_VISIBLE_MS };
