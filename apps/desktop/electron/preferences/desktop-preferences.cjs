const { createPreferencesStore } = require('./preferences-store.cjs');
const { initializeLaunchAtStartup } = require('./launch-at-startup.cjs');

function initializeDesktopPreferences(app, file) {
  const preferencesStore = createPreferencesStore(file, { platform: process.platform });
  const startupPreferences = preferencesStore.repair();
  const launchAtStartup = initializeLaunchAtStartup(app, startupPreferences);
  return { preferencesStore, startupPreferences, launchAtStartup };
}

module.exports = { initializeDesktopPreferences };
