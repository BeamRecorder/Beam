function createShortcutDispatcher({
  BrowserWindow,
  preferencesStore,
  teleprompterWindow,
  getTray,
  getQuickSnip,
  isReady,
  pending,
}) {
  const dispatch = (id) => {
    if (id.startsWith('hud.') && getTray()?.dispatchHudShortcut(id)) return true;
    if (id.startsWith('teleprompter.')) return teleprompterWindow.handleShortcut(id);
    if (id === 'quickSnip.toggle') {
      void getQuickSnip()
        ?.toggle()
        .catch((error) => console.error('[Quick Snip] toggle failed:', error));
      return true;
    }
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('preferences:shortcut', id);
    return true;
  };
  return {
    dispatch,
    external(id) {
      if (!isReady()) {
        pending.push(id);
        return false;
      }
      if (preferencesStore.read().shortcuts[id]?.scope === 'global') return dispatch(id);
      return false;
    },
  };
}
module.exports = { createShortcutDispatcher };
