const path = require('node:path');
const { installBrowserZoomPolicy } = require('../window/browser-zoom-policy.cjs');

function createSourcePickerSurface({
  BrowserWindow,
  applicationRoot,
  role,
  bounds,
  platform,
  isPackaged,
  development,
  onFailure,
  onReady,
}) {
  const interactive = role === 'chooser';
  const target = new BrowserWindow({
    ...bounds,
    title: `Beam Source Selection — ${role}`,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: interactive,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      additionalArguments: development ? ['--beam-dev-crossplatform'] : [],
      preload: path.join(applicationRoot, 'electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  let deadline;
  try {
    target.setContentProtection(true);
    target.setIgnoreMouseEvents(!interactive);
    if (platform === 'darwin')
      target.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    installBrowserZoomPolicy(target.webContents);
    let nativeReady = false;
    let rendererReady = false;
    let ready = false;
    deadline = setTimeout(() => onFailure(new Error('Source selection did not become ready')), 15_000);
    const checkReady = () => {
      if (ready || !nativeReady || !rendererReady || target.isDestroyed()) return;
      ready = true;
      clearTimeout(deadline);
      onReady();
    };
    target.once('ready-to-show', () => {
      nativeReady = true;
      checkReady();
    });
    target.on('closed', () => {
      clearTimeout(deadline);
      onFailure(new Error('Source selection closed'));
    });
    target.webContents.on('render-process-gone', () => onFailure(new Error('Source selection renderer stopped')));
    target.on('unresponsive', () => onFailure(new Error('Source selection is unresponsive')));
    target.webContents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame) onFailure(new Error(`Source selection failed to load: ${description} (${code})`));
    });
    const loading = isPackaged
      ? target.loadFile(path.join(applicationRoot, 'dist/html/source-picker.html'), { query: { role } })
      : target.loadURL(`http://localhost:6500/html/source-picker.html?role=${role}`);
    loading.catch(onFailure);
    return {
      target,
      role,
      isReady: () => ready,
      markReady(sender) {
        if (target.isDestroyed() || target.webContents !== sender) return false;
        rendererReady = true;
        checkReady();
        return true;
      },
    };
  } catch (error) {
    clearTimeout(deadline);
    if (!target.isDestroyed()) target.destroy();
    throw error;
  }
}

module.exports = { createSourcePickerSurface };
