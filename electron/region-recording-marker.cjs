const path = require('node:path');
const { developmentRendererUrl } = require('./lifecycle/development-session.cjs');
function markerBounds(bounds, region) {
  const left = Math.floor(bounds.x + region.x * bounds.width);
  const top = Math.floor(bounds.y + region.y * bounds.height);
  const right = Math.ceil(bounds.x + (region.x + region.width) * bounds.width);
  const bottom = Math.ceil(bounds.y + (region.y + region.height) * bounds.height);
  const strips = [];
  if (left - 2 >= bounds.x) strips.push({ x: left - 2, y: top, width: 2, height: bottom - top });
  if (right + 2 <= bounds.x + bounds.width) strips.push({ x: right, y: top, width: 2, height: bottom - top });
  if (top - 2 >= bounds.y) strips.push({ x: left, y: top - 2, width: right - left, height: 2 });
  if (bottom + 2 <= bounds.y + bounds.height) strips.push({ x: left, y: bottom, width: right - left, height: 2 });
  return strips;
}
function createRegionRecordingMarker({ BrowserWindow, applicationRoot, isPackaged, platform }) {
  const windows = new Set();
  const hide = () => {
    for (const target of windows) if (!target.isDestroyed()) target.destroy();
    windows.clear();
  };
  return {
    hide,
    show(bounds, region) {
      hide();
      for (const strip of markerBounds(bounds, region)) {
        const target = new BrowserWindow({
          ...strip,
          frame: false,
          thickFrame: false,
          transparent: false,
          backgroundColor: '#b85c38',
          hasShadow: false,
          resizable: false,
          movable: false,
          focusable: false,
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
        windows.add(target);
        target.setIgnoreMouseEvents(true);
        if (platform === 'darwin') {
          target.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
          target.setAlwaysOnTop(true, 'screen-saver');
        }
        const loaded = isPackaged
          ? target.loadFile(path.join(applicationRoot, 'dist/html/region-marker.html'))
          : target.loadURL(developmentRendererUrl('region-marker.html'));
        void loaded.catch(() => {
          if (!target.isDestroyed()) target.destroy();
          windows.delete(target);
        });
        target.on('closed', () => windows.delete(target));
      }
    },
    ready(sender) {
      for (const target of windows)
        if (!target.isDestroyed() && target.webContents === sender) {
          target.showInactive();
          return true;
        }
      return false;
    },
  };
}
module.exports = { markerBounds, createRegionRecordingMarker };
