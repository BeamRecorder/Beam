function registerCaptureWindowIpc({
  applicationIpc,
  BrowserWindow,
  cameraOverlay,
  countdownOverlay,
  screenRegionOverlay,
  teleprompterWindow,
}) {
  applicationIpc.on('camera-overlay:configure', (event, state) => {
    const fromOverlay = cameraOverlay.isRenderer(event.sender);
    cameraOverlay.configure(state);
    if (fromOverlay)
      for (const target of BrowserWindow.getAllWindows()) {
        if (!target.isDestroyed() && target.webContents !== event.sender)
          target.webContents.send('camera-overlay:state', cameraOverlay.state());
      }
  });
  applicationIpc.on('camera-overlay:set-active', (_event, active) => cameraOverlay.setActive(active));
  applicationIpc.on('camera-overlay:reset-placement', () => cameraOverlay.resetPlacement());
  applicationIpc.handle('countdown:set', (_event, seconds) => {
    countdownOverlay.show(Number.isInteger(seconds) && seconds >= 0 ? seconds : null);
  });
  applicationIpc.on('countdown:ready', (event) => countdownOverlay.markRendererReady(event.sender));
  applicationIpc.handle('recording-surface:prepare', async () => {
    countdownOverlay.show(null);
    screenRegionOverlay.hide();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Commit hidden surfaces before capture.
  });
  applicationIpc.handle('screen-region:select', (event, options) =>
    screenRegionOverlay.select(options, BrowserWindow.fromWebContents(event.sender)),
  );
  applicationIpc.handle('screen-region:teleprompter', (event, options) => {
    if (screenRegionOverlay.nativeWindow()?.webContents !== event.sender)
      throw new Error('Only the region selector can open its teleprompter.');
    return teleprompterWindow.toggleForRegion(options);
  });
  applicationIpc.handle('screen-region:teleprompter-region', (event, options) => {
    if (screenRegionOverlay.nativeWindow()?.webContents !== event.sender)
      throw new Error('Only the region selector can update its teleprompter.');
    teleprompterWindow.updateRegionConstraint(options);
  });
  applicationIpc.on('screen-region:marker-ready', (event) => screenRegionOverlay.markMarkerReady(event.sender));
  applicationIpc.on('screen-region:ready', (event) => screenRegionOverlay.markRendererReady(event.sender));
  applicationIpc.on('screen-region:show', (_event, options) => screenRegionOverlay.show(options));
  applicationIpc.on('screen-region:hide', () => screenRegionOverlay.hide());
  applicationIpc.on('screen-region:confirm', (event, region, recording) => {
    if (screenRegionOverlay.nativeWindow()?.webContents === event.sender)
      screenRegionOverlay.confirm(region, recording);
  });
  applicationIpc.on('screen-region:update', (event, region) => {
    if (screenRegionOverlay.nativeWindow()?.webContents === event.sender) screenRegionOverlay.update(region);
  });
  applicationIpc.on('screen-region:cancel', (event) => {
    if (screenRegionOverlay.nativeWindow()?.webContents === event.sender) screenRegionOverlay.cancel();
  });
  applicationIpc.handle('camera-overlay:state', () => cameraOverlay.state());
}
module.exports = { registerCaptureWindowIpc };
