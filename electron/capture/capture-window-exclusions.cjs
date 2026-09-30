function captureWindowExclusions(BrowserWindow, platform) {
  if (platform !== 'darwin') return [];
  return BrowserWindow.getAllWindows()
    .filter((window) => {
      if (window.isDestroyed()) return false;
      const value = window.webContents.getURL();
      if (!value) return false;
      const url = new URL(value);
      return (
        url.pathname.endsWith('/html/teleprompter.html') ||
        url.pathname.endsWith('/html/countdown.html') ||
        url.pathname.endsWith('/html/screen-region.html') ||
        url.searchParams.get('cameraOverlay') === '1'
      );
    })
    .map((window) => window.getMediaSourceId().split(':')[1])
    .filter((id) => /^\d+$/.test(id));
}
module.exports = { captureWindowExclusions };
