function settingsOwnerOptions(BrowserWindow, editors, quickSnip, preferences) {
  return {
    editorContextFor: editors.contextFor,
    shortcutCapture: preferences.setShortcutCapture,
    settingsOwnerFor: (sender) =>
      editors.contextFor(sender) || quickSnip.cropWindow.owns(sender) || quickSnip.settingsWindow.owns(sender)
        ? BrowserWindow.fromWebContents(sender)
        : null,
  };
}
module.exports = { settingsOwnerOptions };
