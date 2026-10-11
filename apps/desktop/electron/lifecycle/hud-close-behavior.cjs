function registerHudCloseBehavior({ window, controller, preferencesStore, coordinator, hasTray, requestQuit }) {
  const onClose = (event) => {
    // Explicit Quit, updater restarts and shutdown must never hide to the tray.
    if (!coordinator.canAcceptWork()) return;
    event.preventDefault();
    if (preferencesStore.read().minimizeToTray === true && hasTray()) {
      controller.setVisible(false);
    } else {
      // Keep the HUD alive until the existing shutdown coordinator has stopped
      // capture and released its owned windows and resources.
      requestQuit();
    }
  };
  window.on('close', onClose);
  return () => window.removeListener('close', onClose);
}

module.exports = { registerHudCloseBehavior };
