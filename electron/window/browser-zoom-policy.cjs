const DEFAULT_ZOOM_FACTOR = 1;
const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0']);

function isBrowserZoomShortcut(input) {
  return Boolean(
    input?.type === 'keyDown' &&
    (input.control || input.meta) &&
    ZOOM_KEYS.has(typeof input.key === 'string' ? input.key : ''),
  );
}

function enforceDefaultZoom(webContents) {
  if (!webContents || webContents.isDestroyed?.()) return;
  webContents.setZoomLevel?.(0);
  webContents.setZoomFactor?.(DEFAULT_ZOOM_FACTOR);
}

function installBrowserZoomPolicy(webContents, { resetOnLoad = true } = {}) {
  if (!webContents) return () => undefined;

  const restore = () => enforceDefaultZoom(webContents);
  const restoreAfterRequest = (event) => {
    event?.preventDefault?.();
    restore();
    setImmediate(restore);
  };
  const preventKeyboardZoom = (event, input) => {
    if (isBrowserZoomShortcut(input)) event.preventDefault();
  };

  webContents.on?.('zoom-changed', restoreAfterRequest);
  webContents.on?.('before-input-event', preventKeyboardZoom);
  if (resetOnLoad) webContents.on?.('did-finish-load', restore);

  return () => {
    webContents.removeListener?.('zoom-changed', restoreAfterRequest);
    webContents.removeListener?.('before-input-event', preventKeyboardZoom);
    if (resetOnLoad) webContents.removeListener?.('did-finish-load', restore);
  };
}

module.exports = { DEFAULT_ZOOM_FACTOR, enforceDefaultZoom, installBrowserZoomPolicy, isBrowserZoomShortcut };
