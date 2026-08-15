const { BrowserWindow, screen } = require('electron');
const path = require('path');

const DEFAULT_SIZE = { width: 320, height: 180 };
const MIN_SIZE = { width: 120, height: 90 };

function createCameraOverlayWindow({
  applicationRoot,
  isPackaged,
  preferencesStore = null,
  platform = process.platform,
  canAcceptWork = () => true,
}) {
  let window = null;
  let currentState = null;
  let hoverTimer = null;
  let savePlacementTimer = null;
  let isHovered = false;
  let active = true;

  const readSavedPlacement = () => {
    const saved = preferencesStore?.read()?.extras?.cameraOverlay;
    if (!saved || typeof saved !== 'object') return null;
    const x = Number(saved.x);
    const y = Number(saved.y);
    const width = Number(saved.width);
    const height = Number(saved.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(MIN_SIZE.width, Math.round(width)),
      height: Math.max(MIN_SIZE.height, Math.round(height)),
    };
  };

  const persistPlacement = () => {
    if (!preferencesStore || !window || window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds();
    preferencesStore.patch({
      extras: {
        cameraOverlay: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      },
    });
  };

  const schedulePlacementSave = () => {
    if (!preferencesStore) return;
    if (savePlacementTimer) clearTimeout(savePlacementTimer);
    savePlacementTimer = setTimeout(() => {
      savePlacementTimer = null;
      persistPlacement();
    }, 150);
  };

  const flushPlacementSave = () => {
    if (savePlacementTimer) clearTimeout(savePlacementTimer);
    savePlacementTimer = null;
    persistPlacement();
  };

  const load = (target, query) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/index.html'), { query });
    else target.loadURL(`http://localhost:6500/?${new URLSearchParams(query).toString()}`);
  };

  let lastKnownBounds = null;

  const syncHoverState = () => {
    if (!window || window.isDestroyed()) return;
    const bounds = window.getBounds();
    if (
      !lastKnownBounds ||
      bounds.x !== lastKnownBounds.x ||
      bounds.y !== lastKnownBounds.y ||
      bounds.width !== lastKnownBounds.width ||
      bounds.height !== lastKnownBounds.height
    ) {
      lastKnownBounds = { ...bounds };
      schedulePlacementSave();
    }
    const point = screen.getCursorScreenPoint();
    const next =
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height;
    if (next === isHovered) return;
    isHovered = next;
    window.webContents.send('camera-overlay:hover', next);
  };

  const startHoverTracking = () => {
    if (hoverTimer) return;
    hoverTimer = setInterval(syncHoverState, 80);
  };

  const stopHoverTracking = () => {
    if (!hoverTimer) return;
    clearInterval(hoverTimer);
    hoverTimer = null;
    isHovered = false;
  };

  const create = () => {
    if (!canAcceptWork()) return null;
    if (window && !window.isDestroyed()) return window;
    const saved = readSavedPlacement();
    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const width = saved?.width || DEFAULT_SIZE.width;
    const height = saved?.height || DEFAULT_SIZE.height;
    let x = saved?.x ?? primaryWorkArea.x + primaryWorkArea.width - width - 20;
    let y = saved?.y ?? primaryWorkArea.y + primaryWorkArea.height - height - 20;

    const display = screen.getDisplayMatching({ x, y, width, height });
    if (display) {
      const maxX = display.workArea.x + Math.max(0, display.workArea.width - width);
      const maxY = display.workArea.y + Math.max(0, display.workArea.height - height);
      x = Math.min(Math.max(x, display.workArea.x), maxX);
      y = Math.min(Math.max(y, display.workArea.y), maxY);
    }

    window = new BrowserWindow({
      width,
      height,
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      x,
      y,
      frame: false,
      // Electron does not reliably support manually resizing transparent
      // windows on Linux. The camera fills its window, so an opaque black
      // backing preserves its appearance while restoring native resize edges.
      transparent: platform !== 'linux',
      backgroundColor: platform === 'linux' ? '#000000' : '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      // Wayland's compositor-provided resize boundary for frameless windows is
      // part of the GTK shadow/decorations. Keep it enabled on Linux.
      hasShadow: platform === 'linux',
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });
    window.setContentProtection(true);
    window.setAlwaysOnTop(true, 'floating');
    window.on('move', schedulePlacementSave);
    window.on('moved', () => {
      flushPlacementSave();
    });
    window.on('resize', schedulePlacementSave);
    window.on('resized', () => {
      flushPlacementSave();
    });
    window.on('closed', () => {
      flushPlacementSave();
      window = null;
      stopHoverTracking();
    });
    window.webContents.once('did-finish-load', () => {
      if (currentState) window?.webContents.send('camera-overlay:state', currentState);
    });
    load(window, { cameraOverlay: '1' });
    return window;
  };

  const configure = (state) => {
    if (!canAcceptWork()) return false;
    currentState = { cameraId: state?.cameraId || 'off' };
    if (!active || currentState.cameraId === 'off') {
      if (window && !window.isDestroyed()) {
        window.webContents.send('camera-overlay:state', { ...currentState, cameraId: 'off' });
        flushPlacementSave();
        window.hide();
      }
      return true;
    }
    const overlay = create();
    if (!overlay) return false;
    overlay.webContents.send('camera-overlay:state', currentState);
    overlay.showInactive();
    overlay.moveTop();
    startHoverTracking();
    return true;
  };

  const setActive = (next) => {
    active = Boolean(next);
    configure(currentState || { cameraId: 'off' });
  };

  const resetPlacement = () => {
    if (!window || window.isDestroyed()) return false;
    const bounds = window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    window.setPosition(
      Math.round(area.x + area.width - bounds.width - 20),
      Math.round(area.y + area.height - bounds.height - 20),
    );
    persistPlacement();
    return true;
  };

  const state = () => {
    if (!currentState) return null;
    if (!window || window.isDestroyed()) return currentState;
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching(bounds).workArea;
    return {
      ...currentState,
      placement: {
        x: (bounds.x - display.x) / display.width,
        y: (bounds.y - display.y) / display.height,
        width: bounds.width / display.width,
        height: bounds.height / display.height,
      },
    };
  };

  return {
    configure,
    setActive,
    resetPlacement,
    state,
    destroy: () => {
      flushPlacementSave();
      stopHoverTracking();
      if (window && !window.isDestroyed()) window.destroy();
    },
  };
}

module.exports = { createCameraOverlayWindow };
