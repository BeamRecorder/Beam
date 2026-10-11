const quickSnipTargets = {
  'quickSnip.recordScreen': 'screen',
  'quickSnip.recordRegion': 'region',
  'quickSnip.recordWindow': 'window',
};
function createShortcutDispatcher({
  BrowserWindow,
  preferencesStore,
  teleprompterWindow,
  getTray,
  getQuickSnip,
  getRegionOverlay,
  isReady,
  pending,
}) {
  const dispatch = (id) => {
    if (getRegionOverlay?.()?.handleShortcut(id)) return true;
    if (id.startsWith('hud.') && getTray()?.dispatchHudShortcut(id)) return true;
    if (id.startsWith('teleprompter.')) return teleprompterWindow.handleShortcut(id);
    if (id === 'quickSnip.toggle' || Object.hasOwn(quickSnipTargets, id)) {
      const quickSnip = getQuickSnip();
      const task = id === 'quickSnip.toggle' ? quickSnip?.toggle() : quickSnip?.record(quickSnipTargets[id]);
      void task?.catch((error) => console.error('[Quick Snip] shortcut failed:', error));
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
