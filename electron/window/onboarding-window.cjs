const { BrowserWindow } = require('electron');
const path = require('path');

const ONBOARDING_DEFAULT_SIZE = { width: 920, height: 620 };
const ONBOARDING_MIN_SIZE = { width: 800, height: 520 };
const TITLEBAR_HEIGHT = 40;
const TITLEBAR_SYMBOL_COLOR = '#7a7a7a';

class OnboardingWindowController {
  constructor(window, showHud) {
    this.window = window;
    this.showHudWindow = showHud;
  }

  showHud() {
    this.showHudWindow();
  }

  setVisible(visible) {
    if (visible) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
    } else {
      this.window.hide();
    }
  }

  setHudInteractive() {}
  applyModePolicy() {}
}

function createOnboardingWindowManager({
  applicationRoot,
  isPackaged,
  ipcMain,
  hudWindow,
  hudController,
  registerController,
  preferencesStore,
  initialDark = false,
}) {
  let window = null;
  let controller = null;
  let returningToHud = false;

  const overlayOptions = () => ({
    color: '#00000000',
    symbolColor: TITLEBAR_SYMBOL_COLOR,
    height: TITLEBAR_HEIGHT,
  });

  const load = (target) => {
    if (isPackaged) target.loadFile(path.join(applicationRoot, 'dist/onboarding.html'));
    else target.loadURL('http://localhost:6500/onboarding.html');
  };

  const showHud = () => {
    returningToHud = true;
    if (window && !window.isDestroyed()) {
      window.close();
    }
    if (hudWindow && !hudWindow.isDestroyed()) {
      if (hudWindow.isMinimized()) hudWindow.restore();
      hudController?.markReadyToShow?.();
      hudController?.showHud?.();
      hudWindow.show();
      hudWindow.focus();
    }
  };

  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    returningToHud = false;

    const dark =
      preferencesStore?.read()?.theme === 'dark' || (preferencesStore?.read()?.theme === 'system' && initialDark);

    window = new BrowserWindow({
      ...ONBOARDING_DEFAULT_SIZE,
      minWidth: ONBOARDING_MIN_SIZE.width,
      minHeight: ONBOARDING_MIN_SIZE.height,
      center: true,
      show: false,
      frame: true,
      transparent: false,
      backgroundColor: dark ? '#141310' : '#f7f5f0',
      titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'hidden',
      titleBarOverlay: false,
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
      thickFrame: true,
      hasShadow: true,
      resizable: true,
      maximizable: false,
      minimizable: true,
      movable: true,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    });

    controller = new OnboardingWindowController(window, showHud);
    registerController?.(window, controller);

    load(window);

    window.once('ready-to-show', () => {
      if (!window || window.isDestroyed()) return;
      window.show();
      window.focus();
    });

    window.on('close', () => {
      // If the user closes the onboarding window or dismisses it, ensure preference is marked and HUD is shown
      try {
        preferencesStore?.patch({ onboardingCompleted: true });
      } catch {
        // Best effort
      }
    });

    window.on('closed', () => {
      window = null;
      controller = null;
      if (!returningToHud) {
        showHud();
      }
    });

    return window;
  };

  const open = () => {
    ensure();
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  };

  const close = () => {
    try {
      preferencesStore?.patch({ onboardingCompleted: true });
    } catch {}
    showHud();
  };

  const complete = () => {
    try {
      preferencesStore?.patch({ onboardingCompleted: true });
    } catch {}
    showHud();
  };

  const destroy = () => {
    returningToHud = true;
    if (window && !window.isDestroyed()) {
      window.destroy();
      window = null;
      controller = null;
    }
  };

  ipcMain.handle('onboarding:open', () => {
    open();
    return true;
  });

  ipcMain.handle('onboarding:close', () => {
    close();
    return true;
  });

  ipcMain.handle('onboarding:complete', () => {
    complete();
    return true;
  });

  return {
    open,
    close,
    complete,
    destroy,
    showHud,
    getWindow: () => window,
  };
}

module.exports = { createOnboardingWindowManager };
