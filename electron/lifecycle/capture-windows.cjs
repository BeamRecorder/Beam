const { createCameraOverlayWindow } = require('../camera/overlay-window.cjs');
const { createCountdownWindow } = require('../countdown-window.cjs');
const { createRegionSelectionPreview } = require('../region-selection-preview.cjs');
const { createScreenRegionOverlayWindow } = require('../screen-region-overlay.cjs');
const { registerCaptureWindowIpc } = require('./capture-window-ipc.cjs');

function createCaptureWindows({
  lifecycleOptions,
  preferencesStore,
  captureEngine,
  screen,
  teleprompterWindow,
  BrowserWindow,
  applicationIpc,
  onCameraClosed,
  platform = process.platform,
}) {
  const cameraOverlay = createCameraOverlayWindow({
    ...lifecycleOptions,
    preferencesStore,
    platform,
    onWebContentsDestroyed: onCameraClosed,
  });
  const countdownOverlay = createCountdownWindow({ ...lifecycleOptions, platform });
  const selectionPreview = createRegionSelectionPreview({
    captureEngine,
    screen,
    teleprompterWindow,
    BrowserWindow,
    platform,
  });
  const screenRegionOverlay = createScreenRegionOverlayWindow({
    ...lifecycleOptions,
    platform,
    screen,
    selectionPreview,
  });
  registerCaptureWindowIpc({
    applicationIpc,
    BrowserWindow,
    cameraOverlay,
    countdownOverlay,
    screenRegionOverlay,
    teleprompterWindow,
  });
  return { cameraOverlay, countdownOverlay, screenRegionOverlay };
}
module.exports = { createCaptureWindows };
