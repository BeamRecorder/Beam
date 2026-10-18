function settingsOwnerOptions(BrowserWindow, editors, quickSnip, preferences, preparation) {
  return {
    editorContextFor: editors.contextFor,
    shortcutCapture: preferences.setShortcutCapture,
    settingsOwnerFor: (sender) =>
      preparation.settingsOwnerFor(sender) ??
      (editors.contextFor(sender) || quickSnip.cropWindow.owns(sender) || quickSnip.settingsWindow.owns(sender)
        ? BrowserWindow.fromWebContents(sender)
        : null),
  };
}
module.exports = { settingsOwnerOptions };
