const { BrowserWindow } = require('electron');
const path = require('path');
const { developmentRendererUrl } = require('../lifecycle/development-session.cjs');

const ONBOARDING_DEFAULT_SIZE = { width: 920, height: 720 };
const ONBOARDING_MIN_SIZE = { width: 800, height: 600 };

class OnboardingWindowController {
  constructor(window, showHud, present) {
    this.window = window;
    this.showHudWindow = showHud;
    this.present = present;
  }

  showHud() {
    this.showHudWindow();
  }

  setVisible(visible) {
    if (visible) {
      this.present();
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
  appIconPath,
  initialDark = false,
}) {
  let window = null;
  let controller = null;
  let returningToHud = false;
  let readyWindow = null;

  const load = (target) => {
    if (isPackaged) return target.loadFile(path.join(applicationRoot, 'dist/html/onboarding.html'));
    return target.loadURL(developmentRendererUrl('onboarding.html'));
  };

  const present = () => {
    if (!window || window.isDestroyed() || readyWindow !== window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
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
      icon: appIconPath,
      frame: true,
      transparent: false,
      backgroundColor: dark ? '#111114' : '#faf9f6',
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
        preload: path.join(applicationRoot, 'apps/desktop/electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: false,
      },
    });

    const target = window;
    controller = new OnboardingWindowController(window, showHud, present);
    registerController?.(window, controller);

    target.once('ready-to-show', () => {
      if (window !== target || target.isDestroyed()) return;
      readyWindow = target;
      present();
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
      if (window !== target) return;
      window = null;
      readyWindow = null;
      controller = null;
      if (!returningToHud) {
        showHud();
      }
    });

    void load(target).catch((error) => {
      console.error('[Onboarding] Renderer loading failed:', error);
      if (window === target && !target.isDestroyed()) target.destroy();
    });

    return window;
  };

  const open = () => {
    ensure();
    present();
  };

  const close = () => {
    preferencesStore.patch({ onboardingCompleted: true });
    showHud();
  };

  const complete = () => {
    preferencesStore.patch({ onboardingCompleted: true });
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
