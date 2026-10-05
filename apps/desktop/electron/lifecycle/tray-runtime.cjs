const { createTrayManager } = require('../tray/tray-manager.cjs');
const { createIdleHudRenderer } = require('./idle-hud-renderer.cjs');

function createTrayRuntime({
  window,
  controller,
  showHud,
  quickSnipService,
  cameraOverlay,
  countdownOverlay,
  teleprompterWindow,
  preferencesStore,
  applicationRoot,
  coordinator,
  isScreenshotBusy,
  regionOverlay,
}) {
  const idle = createIdleHudRenderer({
    window,
    controller,
    canSuspend: () =>
      preferencesStore.read().onboardingCompleted &&
      !quickSnipService.isNormalRecordingActive() &&
      !isScreenshotBusy() &&
      !regionOverlay.isSelecting() &&
      ['idle', 'completed', 'failed', 'canceled'].includes(quickSnipService.controller.state().state),
    releaseAuxiliary: async () => {
      const saved = await teleprompterWindow.suspend();
      if (saved === false) return false;
      countdownOverlay.suspend();
      cameraOverlay.destroy();
      return true;
    },
  });
  const manager = createTrayManager({
    applicationRoot,
    getWindow: () => window,
    getController: () => controller,
    onShowHud: () => {
      void idle
        .resume()
        .then(showHud)
        .catch((error) => console.error('[Beam wake]', error));
    },
    onHideHud: () => controller.setVisible(false),
    onQuickSnip: () => {
      const state = quickSnipService.controller.state().state;
      const action =
        state === 'selecting' ? quickSnipService.controller.cancel() : quickSnipService.controller.toggle();
      void action.catch((error) => console.error('[Quick Snip] tray action failed:', error));
    },
  });
  const reschedule = () => {
    manager.updateMenu();
    idle.schedule();
  };
  window.on('show', reschedule);
  window.on('hide', reschedule);
  const originalSetState = manager.setQuickSnipState;
  manager.setQuickSnipState = (state) => {
    originalSetState(state);
    idle.schedule();
  };
  const originalDestroy = manager.destroy;
  manager.destroy = () => {
    idle.destroy();
    window.removeListener('show', reschedule);
    window.removeListener('hide', reschedule);
    originalDestroy();
  };
  manager.dispatchHudShortcut = (id) => {
    if (!idle.isSuspended()) return false;
    void idle
      .resume()
      .then(() => {
        showHud();
        window.webContents.send('preferences:shortcut', id);
      })
      .catch((error) => console.error('[Beam shortcut wake]', error));
    return true;
  };
  coordinator.registerCleanup({ id: 'hud-standby', cleanup: idle.destroy });
  return manager;
}
module.exports = { createTrayRuntime };
