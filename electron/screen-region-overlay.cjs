const { BrowserWindow } = require('electron');
const os = require('node:os');
const path = require('path');

function supportsCaptureSafeRecordingOverlay(platform, release) {
  if (platform !== 'win32') return true;
  const build = Number.parseInt(String(release).split('.')[2] || '', 10);
  // The marker is a transparent, display-sized window protected with
  // WDA_EXCLUDEFROMCAPTURE. On Windows 10 that combination can be represented
  // as a black protected surface in Windows Graphics Capture, which makes a
  // region recording black. Keep the marker on Windows 11+, where transparent
  // capture exclusion is reliable, and fail closed when the build is unknown.
  return Number.isFinite(build) && build >= 22_000;
}

function finiteBounds(value) {
  if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key])))
    throw new Error('Screen overlay bounds are invalid');
  if (value.width <= 0 || value.height <= 0) throw new Error('Screen overlay size is invalid');
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.round(value.width),
    height: Math.round(value.height),
  };
}

function resolveSelectionBounds(options, platform, screen, parentWindow) {
  if (options?.bounds) return finiteBounds(options.bounds);
  if (platform !== 'linux') throw new Error('Screen overlay bounds are required');
  const parentBounds = parentWindow && !parentWindow.isDestroyed() ? parentWindow.getBounds() : null;
  const display =
    (parentBounds && typeof screen?.getDisplayMatching === 'function' && screen.getDisplayMatching(parentBounds)) ||
    screen?.getPrimaryDisplay?.();
  if (!display?.bounds) throw new Error('No display is available for Linux region selection');
  return finiteBounds(display.bounds);
}

function createScreenRegionOverlayWindow({
  applicationRoot,
  isPackaged,
  canAcceptWork = () => true,
  platform = process.platform,
  platformRelease = os.release(),
  screen,
}) {
  let window = null;
  let ready = false;
  let pending = null;
  let current = null;

  const cancelPendingSelection = () => {
    if (!pending) return;
    const resolve = pending.resolve;
    pending = null;
    current = null;
    window?.hide();
    window?.setParentWindow(null);
    resolve(null);
  };

  const send = (options) => {
    if (!window || window.isDestroyed() || !ready) return;
    window.webContents.send('screen-region:configure', options);
  };

  const ensureWindow = () => {
    if (!canAcceptWork()) throw new Error('Cannot create a screen overlay while Beam is shutting down');
    if (window && !window.isDestroyed()) return window;
    window = new BrowserWindow({
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: true,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    window.setContentProtection(true);
    if (platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      window.setAlwaysOnTop(true, 'screen-saver');
      window.webContents.on('before-input-event', (event, input) => {
        if (pending && input.type === 'keyDown' && input.key === 'Escape') {
          event.preventDefault();
          cancelPendingSelection();
        }
      });
    }
    window.once('ready-to-show', () => {
      ready = true;
      send(current);
    });
    window.on('closed', () => {
      ready = false;
      window = null;
      if (pending) {
        pending.resolve(null);
        pending = null;
      }
    });
    if (isPackaged) window.loadFile(path.join(applicationRoot, 'dist/index.html'), { query: { screenRegion: '1' } });
    else window.loadURL('http://localhost:6500/?screenRegion=1');
    return window;
  };

  const configure = (options, interactive, parentWindow = null) => {
    const target = ensureWindow();
    current = { ...options, bounds: finiteBounds(options.bounds), mode: interactive ? 'select' : 'record' };
    target.setParentWindow(interactive && platform === 'linux' ? parentWindow : null);
    target.setBounds(current.bounds);
    target.setIgnoreMouseEvents(!interactive);
    send(current);
    if (interactive) {
      target.show();
      target.focus();
    } else {
      target.showInactive();
    }
    target.moveTop();
  };

  return {
    select(options, parentWindow = null) {
      if (pending) {
        pending.resolve(null);
        pending = null;
      }
      const result = new Promise((resolve) => {
        pending = { resolve };
      });
      try {
        configure(
          { ...options, bounds: resolveSelectionBounds(options, platform, screen, parentWindow) },
          true,
          parentWindow,
        );
      } catch (error) {
        pending = null;
        current = null;
        if (window && !window.isDestroyed()) {
          window.hide();
          window.setParentWindow(null);
        }
        throw error;
      }
      return result;
    },
    show(options) {
      if (!supportsCaptureSafeRecordingOverlay(platform, platformRelease)) {
        current = null;
        if (window && !window.isDestroyed()) window.hide();
        return;
      }
      configure(options, false);
    },
    hide() {
      current = null;
      if (window && !window.isDestroyed()) window.hide();
    },
    confirm(region) {
      if (!pending) return;
      const resolve = pending.resolve;
      const bounds = current?.bounds;
      pending = null;
      current = null;
      window?.hide();
      window?.setParentWindow(null);
      resolve(bounds ? { bounds: { ...bounds }, region } : null);
    },
    cancel() {
      cancelPendingSelection();
    },
    destroy() {
      if (pending) {
        pending.resolve(null);
        pending = null;
      }
      window?.destroy();
      window = null;
    },
  };
}

module.exports = {
  createScreenRegionOverlayWindow,
  resolveSelectionBounds,
  supportsCaptureSafeRecordingOverlay,
};
