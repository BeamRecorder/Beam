const path = require('node:path');
const { developmentRendererUrl } = require('../lifecycle/development-session.cjs');
const { validateSettingsAnchor, settingsLayout } = require('./quick-snip-settings-layout.cjs');

function createQuickSnipSettingsWindow({
  BrowserWindow,
  applicationRoot,
  isPackaged,
  screen,
  environment = process.env,
  platform = process.platform,
}) {
  let window = null;
  let nativeReady = false;
  let rendererReady = false;
  let measurementRequested = false;
  let measured = false;
  let requested = false;
  let configuration = null;
  let timer = null;
  let blurTimer = null;
  let closingTimer = null;
  let parentWindow = null;
  let contentHeight = 420;
  let anchor = null;
  let device = null;
  let pendingDevice = null;
  const notifyToolbar = () => {
    if (parentWindow && !parentWindow.isDestroyed())
      parentWindow.webContents.send('quick-snip:settings-visibility', requested && !device);
  };
  const finishDevice = (id = null, error = null) => {
    const pending = pendingDevice;
    pendingDevice = null;
    if (error) pending?.reject(error);
    else pending?.resolve(id);
  };
  const hide = (animate = false) => {
    clearTimeout(blurTimer);
    clearTimeout(closingTimer);
    const wasRequested = requested;
    requested = false;
    notifyToolbar();
    if (window && !window.isDestroyed()) {
      if (animate && wasRequested && measured) {
        const target = window;
        position();
        target.setIgnoreMouseEvents(true);
        closingTimer = setTimeout(() => {
          if (window === target && !target.isDestroyed() && !requested) target.hide();
        }, 150);
      } else window.hide();
    }
    finishDevice();
  };
  const position = () => {
    const bar = parentWindow.getBounds();
    const layout = settingsLayout(bar, screen.getDisplayMatching(bar).workArea, contentHeight, anchor);
    window.setBounds(layout.bounds);
    if (rendererReady)
      window.webContents.send('quick-snip:settings-content', {
        side: layout.side,
        anchorX: layout.anchorX,
        device,
        visible: requested && measured,
      });
  };
  const present = () => {
    if (!window || window.isDestroyed() || !nativeReady || !rendererReady) return;
    clearTimeout(timer);
    if (!requested) return;
    if (!measurementRequested) {
      measurementRequested = true;
      position();
      if (configuration) window.webContents.send('quick-snip:configure', configuration);
      return;
    }
    if (!measured) return;
    clearTimeout(timer);
    position();
    window.show();
    window.focus();
  };
  const detachParent = () => {
    parentWindow?.removeListener('move', hide);
    parentWindow?.removeListener('closed', hide);
  };
  const open = (parent, nextAnchor, show = true) => {
    if (!parent || parent.isDestroyed()) throw new Error('Quick Snip toolbar is unavailable.');
    anchor = validateSettingsAnchor(nextAnchor, parent.getBounds());
    detachParent();
    parentWindow = parent;
    parent.on('move', hide);
    parent.on('closed', hide);
    clearTimeout(closingTimer);
    requested = show;
    measured = measurementRequested = false;
    notifyToolbar();
    if (!window || window.isDestroyed()) {
      nativeReady = rendererReady = false;
      const target = new BrowserWindow({
        parent,
        ...settingsLayout(
          parent.getBounds(),
          screen.getDisplayMatching(parent.getBounds()).workArea,
          contentHeight,
          anchor,
        ).bounds,
        frame: false,
        resizable: false,
        movable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        transparent: true,
        backgroundColor: '#00000000',
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        hasShadow: false,
        ...(platform === 'linux' ? { type: 'popup-menu' } : {}),
        ...(platform === 'darwin' ? { animationBehavior: 'none' } : {}),
        webPreferences: {
          preload: path.join(applicationRoot, 'apps/desktop/electron/preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          backgroundThrottling: false,
        },
      });
      window = target;
      target.setContentProtection(true);
      target.setAlwaysOnTop(true, 'screen-saver');
      const dispose = (error) => {
        if (window !== target) return;
        finishDevice(null, error instanceof Error ? error : new Error('Quick Snip menu is unavailable.'));
        hide();
        target.destroy();
        window = null;
      };
      target.once('ready-to-show', () => {
        if (window === target) {
          nativeReady = true;
          present();
        }
      });
      target.on('blur', () => {
        clearTimeout(blurTimer);
        // Native focus moves before the toolbar dispatches its click. Keep the
        // panel open during that handoff so the same trigger can toggle it closed.
        blurTimer = setTimeout(() => {
          if (requested && !parentWindow?.isFocused()) hide(true);
        }, 60);
      });
      target.on('unresponsive', dispose);
      target.webContents.on('render-process-gone', dispose);
      target.on('closed', () => {
        if (window === target) {
          clearTimeout(timer);
          hide();
          window = null;
        }
      });
      const load = isPackaged
        ? target.loadFile(path.join(applicationRoot, 'dist/html/index.html'), { query: { quickSnipSettings: '1' } })
        : target.loadURL(developmentRendererUrl('index.html?quickSnipSettings=1', environment));
      void load.catch(dispose);
      timer = setTimeout(dispose, 30_000);
      timer.unref?.();
    } else {
      window.setIgnoreMouseEvents(false);
      present();
    }
  };
  return {
    toggle(parent, next, nextAnchor) {
      if (requested && !device) {
        hide(true);
        return;
      }
      hide();
      configuration = next;
      device = null;
      open(parent, nextAnchor);
    },
    prepare(parent, next) {
      if (!parent || parent.isDestroyed() || (window && !window.isDestroyed())) return;
      configuration = next;
      device = null;
      open(parent, { x: parent.getBounds().width - 100, y: 22, width: 32, height: 32 }, false);
    },
    chooseDevice(parent, request) {
      hide();
      configuration = null;
      device = request;
      contentHeight = Math.min(360, request.options.length * 32 + 8);
      return new Promise((resolve, reject) => {
        pendingDevice = { resolve, reject };
        try {
          open(parent, { x: request.position.x - 16, y: request.position.y - 32, width: 32, height: 32 });
        } catch (error) {
          finishDevice(null, error);
          hide();
        }
      });
    },
    selectDevice(sender, id) {
      if (!window || window.isDestroyed() || window.webContents !== sender || !pendingDevice) return;
      if (typeof id !== 'string' || !device.options.some((option) => option.id === id))
        throw new TypeError('Unknown Quick Snip recording device.');
      finishDevice(id);
      hide();
      if (parentWindow && !parentWindow.isDestroyed()) parentWindow.focus();
    },
    ready(sender) {
      if (window && !window.isDestroyed() && window.webContents === sender) {
        rendererReady = true;
        measured = measurementRequested = false;
        present();
      }
    },
    fit(sender, height) {
      if (!window || window.isDestroyed() || window.webContents !== sender || !Number.isInteger(height) || height <= 0)
        return;
      if (!requested || !measurementRequested || !parentWindow || parentWindow.isDestroyed()) return;
      const nextHeight = Math.min(device ? 360 : 420, Math.max(device ? 32 : 200, height));
      const changed = nextHeight !== contentHeight;
      contentHeight = nextHeight;
      if (!measured) {
        measured = true;
        present();
      } else if (changed) position();
    },
    update(next) {
      configuration = device ? null : next;
      if (configuration && window && !window.isDestroyed() && nativeReady && rendererReady)
        window.webContents.send('quick-snip:configure', configuration);
    },
    hide,
    dismiss: () => hide(true),
    owns: (sender) => Boolean(window && !window.isDestroyed() && window.webContents === sender),
    destroy() {
      clearTimeout(timer);
      hide();
      detachParent();
      window?.destroy();
      window = null;
    },
  };
}
module.exports = { createQuickSnipSettingsWindow };
