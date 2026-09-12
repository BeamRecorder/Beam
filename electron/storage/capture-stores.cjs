const { createEditorPresetStore } = require('../presets/editor-preset-store.cjs');
const { initialEditorSettings } = require('../presets/initial-editor-settings.cjs');
const { createScreenshotStore } = require('../screenshot/screenshot-store.cjs');

function createCaptureStores({ userPaths, preferencesStore, applicationRoot, isPackaged }) {
  const editorPresetStore = createEditorPresetStore(userPaths.editorPresets, {
    readPreferences: () => {
      const preferences = preferencesStore.read();
      return {
        ...preferences,
        extras: {
          ...preferences.extras,
          editorDefaults: preferences.extras?.editorDefaults ?? initialEditorSettings(applicationRoot, isPackaged),
        },
      };
    },
  });
  const screenshotPresetStore = createEditorPresetStore(userPaths.screenshotPresets, {
    readPreferences: () => ({
      extras: {
        editorDefaults: initialEditorSettings(applicationRoot, isPackaged),
        exportSettings: { format: 'png', quality: 0.95 },
      },
    }),
  });
  const screenshotStore = createScreenshotStore(userPaths.screenshots);
  return { editorPresetStore, screenshotPresetStore, screenshotStore };
}

module.exports = { createCaptureStores };
