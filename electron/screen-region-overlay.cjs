const { BrowserWindow } = require('electron');
const os = require('node:os');
const { isCaptureCancellation } = require('./capture/capture-cancellation.cjs');
const { createRegionRecordingMarker } = require('./region-recording-marker.cjs');
const { regionRecordingSettings } = require('./region-selection-settings.cjs');
const path = require('path');
const { developmentRendererUrl } = require('./lifecycle/development-session.cjs');

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

function finiteRegion(value) {
  if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))) return null;
  const x = Math.max(0, Math.min(1, Number(value.x)));
  const y = Math.max(0, Math.min(1, Number(value.y)));
  const width = Math.max(0, Math.min(1 - x, Number(value.width)));
  const height = Math.max(0, Math.min(1 - y, Number(value.height)));
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
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
  selectionPreview,
}) {
  const marker = createRegionRecordingMarker({ BrowserWindow, applicationRoot, isPackaged, platform });
  let window = null;
  let ready = false;
  let rendererReady = false;
  let pending = null;
  let current = null;
  let regionChangeListener = null;

  const cancelPendingSelection = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    const resolve = pending.resolve;
    pending = null;
    current = null;
    window?.hide();
    window?.setParentWindow(null);
    resolve(null);
  };

  const send = (options) => {
    if (!window || window.isDestroyed() || !ready || !rendererReady) return;
    window.webContents.send('screen-region:configure', options);
  };
  const present = () => {
    if (!window || window.isDestroyed() || !ready || !rendererReady || !current) return;
    if (current.mode === 'select') {
      clearTimeout(pending?.timer);
      window.show();
      window.focus();
    } else {
      window.showInactive();
      window.moveTop();
    }
  };

  const ensureWindow = (bounds) => {
    if (!canAcceptWork()) throw new Error('Cannot create a screen overlay while Beam is shutting down');
    if (window && !window.isDestroyed()) return window;
    const target = new BrowserWindow({
      ...bounds,
      frame: false,
      thickFrame: false,
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
        backgroundThrottling: false,
      },
    });
    window = target;
    rendererReady = false;
    window.setContentProtection(true);
    if (platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
      window.setAlwaysOnTop(true, 'screen-saver');
      window.webContents.on('before-input-event', (event, input) => {
        if (pending && !current?.recording && input.type === 'keyDown' && input.key === 'Escape') {
          event.preventDefault();
          cancelPendingSelection();
        }
      });
    }
    window.once('ready-to-show', () => {
      if (window !== target || target.isDestroyed()) return;
      ready = true;
      if (current) send(current);
      present();
    });
    window.on('closed', () => {
      if (window !== target) return;
      rendererReady = false;
      ready = false;
      window = null;
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(null);
        pending = null;
      }
    });
    const fail = (error) => {
      if (window !== target || target.isDestroyed()) return;
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(error);
        pending = null;
      }
      current = null;
      target.destroy();
    };
    target.webContents.on('render-process-gone', () => fail(new Error('Region selector renderer exited.')));
    target.on('unresponsive', () => fail(new Error('Region selector is unresponsive.')));
    const loaded = isPackaged
      ? target.loadFile(path.join(applicationRoot, 'dist/html/screen-region.html'))
      : target.loadURL(developmentRendererUrl('screen-region.html'));
    void loaded.catch(fail);
    return window;
  };

  const configure = (options, interactive, parentWindow = null) => {
    const bounds = finiteBounds(options.bounds);
    const target = ensureWindow(bounds);
    current = { ...options, bounds, mode: interactive ? 'select' : 'record' };
    target.setParentWindow(
      interactive && platform === 'linux' && options.context === 'quick-snip' ? parentWindow : null,
    );
    target.setBounds(current.bounds);
    target.setIgnoreMouseEvents(!interactive);
    send(current);
    present();
  };

  return {
    isSelecting: () => Boolean(pending),
    markMarkerReady: (sender) => marker.ready(sender),
    markRendererReady(sender) {
      if (!window || window.isDestroyed() || window.webContents !== sender) return false;
      rendererReady = true;
      if (current) send(current);
      present();
      return true;
    },
    async select(options, parentWindow = null) {
      if (pending) throw new Error('A region selection is already open.');
      const result = new Promise((resolve, reject) => {
        pending = { resolve, reject, timer: null };
      });
      // A renderer failure can arrive while the native Portal picker is still
      // open. Handle that rejection now, then propagate it below after cleanup.
      void result.catch(() => {});
      const request = pending;
      try {
        const recording = regionRecordingSettings(options.recording, platform);
        const bounds = resolveSelectionBounds(options, platform, screen, parentWindow);
        ensureWindow(bounds);
        const preview =
          options.context !== 'quick-snip' && selectionPreview ? await selectionPreview.prepare(bounds) : {};
        if (pending !== request) {
          await selectionPreview?.cancel();
          return await result;
        }
        configure(
          {
            context: options.context === 'quick-snip' ? 'quick-snip' : 'default',
            captureMode: options.captureMode,
            region: finiteRegion(options.region),
            bounds,
            ...preview,
            ...(recording ? { recording } : {}),
          },
          true,
          parentWindow,
        );
        if (pending === request && (!ready || !rendererReady)) {
          request.timer = setTimeout(() => {
            if (pending !== request) return;
            request.reject(new Error('Region selector did not become ready within 30 seconds.'));
            pending = null;
            current = null;
            window?.destroy();
          }, 30_000);
          request.timer.unref();
        }
      } catch (error) {
        if (pending !== request) return await result;
        pending = null;
        current = null;
        if (window && !window.isDestroyed()) {
          window.hide();
          window.setParentWindow(null);
        }
        if (isCaptureCancellation(error)) return null;
        throw error;
      }
      let selection;
      try {
        selection = await result;
      } catch (error) {
        await selectionPreview?.cancel();
        throw error;
      }
      if (!selection) await selectionPreview?.cancel();
      return selection;
    },
    show(options) {
      if (platform === 'linux' || !supportsCaptureSafeRecordingOverlay(platform, platformRelease)) {
        current = null;
        if (window && !window.isDestroyed()) window.hide();
        const region = finiteRegion(options.region);
        if (region) marker.show(finiteBounds(options.bounds), region);
        return;
      }
      configure(options, false);
    },
    hide() {
      marker.hide();
      current = null;
      if (window && !window.isDestroyed()) window.hide();
    },
    confirm(region, recording) {
      if (!pending) return;
      const selected = finiteRegion(region);
      if (!selected) return;
      const settings = regionRecordingSettings(recording, platform);
      const resolve = pending.resolve;
      clearTimeout(pending.timer);
      const bounds = current?.bounds;
      pending = null;
      current = null;
      window?.hide();
      window?.setParentWindow(null);
      resolve(
        bounds ? { bounds: { ...bounds }, region: selected, ...(settings ? { recording: settings } : {}) } : null,
      );
    },
    update(region) {
      if (!pending || !current) return false;
      const selected = finiteRegion(region);
      if (!selected) return false;
      current = { ...current, region: selected };
      if (current.context === 'quick-snip') regionChangeListener?.(selected, { ...current.bounds });
      return true;
    },
    setRegionChangeListener(listener) {
      regionChangeListener = typeof listener === 'function' ? listener : null;
    },
    nativeWindow() {
      return window && !window.isDestroyed() ? window : null;
    },
    confirmCurrent() {
      if (!pending || !current?.region) return false;
      const resolve = pending.resolve;
      clearTimeout(pending.timer);
      const result = { bounds: { ...current.bounds }, region: { ...current.region } };
      pending = null;
      current = null;
      window?.hide();
      window?.setParentWindow(null);
      resolve(result);
      return true;
    },
    cancel() {
      cancelPendingSelection();
    },
    destroy() {
      marker.hide();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(null);
        pending = null;
      }
      window?.destroy();
      window = null;
      regionChangeListener = null;
    },
  };
}

module.exports = {
  createScreenRegionOverlayWindow,
  resolveSelectionBounds,
  supportsCaptureSafeRecordingOverlay,
};
