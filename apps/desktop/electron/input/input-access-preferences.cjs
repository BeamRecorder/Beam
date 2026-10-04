function createInputAccessPreferenceWriter({ store, BrowserWindow }) {
  return () => {
    const current = store.read().recordingInteractions;
    if (current.enabled && current.noticeDismissed) return;
    const { preferences } = store.patchBatch([{ recordingInteractions: { enabled: true, noticeDismissed: true } }]);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('preferences:changed', preferences);
    }
  };
}

module.exports = { createInputAccessPreferenceWriter };
