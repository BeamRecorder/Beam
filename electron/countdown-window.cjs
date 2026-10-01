const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { developmentRendererUrl } = require('./lifecycle/development-session.cjs');

function createCountdownWindow({
  applicationRoot,
  isPackaged,
  canAcceptWork = () => true,
  platform = process.platform,
}) {
  let window = null;
  let seconds = null;
  let owner = null;
  let interactive = false;
  let ready = false;
  let rendererReady = false;
  let prepared = null;
  let finishPreparation = null;
  const width = 560;
  const height = 320;
  const ownsRenderer = (sender) => Boolean(window && !window.isDestroyed() && window.webContents === sender);
  const updateMouse = () => {
    if (window && !window.isDestroyed())
      window.setIgnoreMouseEvents(platform !== 'linux' && !interactive, { forward: true });
  };
  const position = () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    window?.setPosition(
      display.workArea.x + Math.max(0, Math.round((display.workArea.width - width) / 2)),
      display.workArea.y + Math.max(0, Math.round((display.workArea.height - height) / 2)),
    );
  };
  const destroy = () => {
    const target = window;
    window = null;
    seconds = null;
    owner = null;
    interactive = false;
    ready = false;
    rendererReady = false;
    finishPreparation?.(false);
    finishPreparation = null;
    prepared = null;
    if (target && !target.isDestroyed()) target.destroy();
  };
  const reveal = () => {
    if (!window || window.isDestroyed()) return;
    window.showInactive();
    window.moveTop();
  };
  const present = () => {
    if (!window || window.isDestroyed() || !ready || !rendererReady) return;
    finishPreparation?.(true);
    finishPreparation = null;
    if (seconds === null) return;
    window.webContents.send('countdown:state', seconds);
    position();
    reveal();
  };
  const prepare = () => {
    if (!canAcceptWork()) return Promise.resolve(false);
    if (window && !window.isDestroyed()) return prepared;
    ready = false;
    rendererReady = false;
    prepared = new Promise((resolve) => {
      finishPreparation = resolve;
    });
    const target = new BrowserWindow({
      width,
      height,
      center: false,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    window = target;
    interactive = false;
    updateMouse();
    const failPreparation = () => {
      if (target === window) destroy();
    };
    target.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (code !== -3 && isMainFrame !== false) failPreparation();
    });
    target.webContents.once('did-finish-load', () => {
      if (target !== window || target.isDestroyed()) return;
      ready = true;
      present();
    });
    const loading = isPackaged
      ? target.loadFile(path.join(applicationRoot, 'dist/html/countdown.html'))
      : target.loadURL(developmentRendererUrl('countdown.html'));
    void Promise.resolve(loading).catch(failPreparation);
    return prepared;
  };
  const show = (value, sender) => {
    if (!canAcceptWork()) return false;
    seconds = Number.isInteger(value) && value > 0 ? value : null;
    if (seconds !== null && sender) owner = sender;
    if (seconds === null) {
      owner = null;
      interactive = false;
      updateMouse();
      if (window && !window.isDestroyed()) window.hide();
      return true;
    }
    prepare();
    position();
    if (ready && rendererReady) {
      window.webContents.send('countdown:state', value);
      reveal();
    }
    return true;
  };
  return {
    show,
    prepare,
    suspend: destroy,
    destroy,
    cancel(sender) {
      if (!ownsRenderer(sender) || seconds === null || !owner || owner.isDestroyed()) return false;
      const recipient = owner;
      show(null);
      recipient.send('countdown:cancelled');
      return true;
    },
    setInteractive(sender, value) {
      if (!ownsRenderer(sender) || typeof value !== 'boolean' || seconds === null) return false;
      if (interactive !== value) {
        interactive = value;
        updateMouse();
      }
      return true;
    },
    markRendererReady(sender) {
      if (!window || window.isDestroyed() || window.webContents !== sender) return false;
      rendererReady = true;
      present();
      return true;
    },
  };
}

module.exports = { createCountdownWindow };
