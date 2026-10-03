const { WindowController } = require('../window/window-controller.cjs');

function applyHudWindowPreferences({ windows, controllers, preferences }) {
  for (const window of windows) {
    const controller = controllers.get(window);
    // Editor controllers share the registry but do not own the HUD's policy.
    if (controller instanceof WindowController) controller.setHudAlwaysOnTop(preferences.alwaysOnTop);
  }
}

module.exports = { applyHudWindowPreferences };
