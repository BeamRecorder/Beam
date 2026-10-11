const ACTIONS = new Set(['recorder', 'webcam', 'devtools']);
function registerSettingsEditorActions({ ipcMain, getSettings, editorContextFor, isPackaged }) {
  let sequence = 0;
  const pending = new Map();
  const liveSettings = (sender) => {
    const panel = getSettings();
    if (!panel?.requested || panel.window.isDestroyed() || panel.window.webContents !== sender)
      throw new Error('Settings are not available.');
    return panel;
  };
  ipcMain.handle('settings:editor-context', (event) => {
    const panel = liveSettings(event.sender);
    return panel.owner && !panel.owner.isDestroyed() ? editorContextFor(panel.owner.webContents) : null;
  });
  ipcMain.handle('settings:editor-action', (event, action) => {
    const panel = liveSettings(event.sender);
    const owner = panel.owner;
    if (isPackaged || !ACTIONS.has(action) || !owner || owner.isDestroyed() || !editorContextFor(owner.webContents))
      throw new Error('Editor tools are not available.');
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const finish = (error) => {
        clearTimeout(timer);
        owner.removeListener('closed', closed);
        pending.delete(id);
        if (error) reject(error);
        else resolve();
      };
      const closed = () => finish(new Error('The editor was closed.'));
      const timer = setTimeout(() => finish(new Error('The editor did not respond.')), 30_000);
      pending.set(id, { sender: owner.webContents, finish });
      owner.once('closed', closed);
      try {
        owner.webContents.send('settings:editor-action', { id, action });
      } catch (error) {
        finish(error);
      }
    });
  });
  ipcMain.on('settings:editor-action-result', (event, result) => {
    if (!result || !Number.isSafeInteger(result.id)) return;
    const request = pending.get(result.id);
    if (!request || request.sender !== event.sender) return;
    if (result.error !== undefined && (typeof result.error !== 'string' || result.error.length > 2048)) return;
    request.finish(result.error ? new Error(result.error) : null);
  });
  return () => {
    for (const request of [...pending.values()]) request.finish(new Error('Settings were closed.'));
  };
}
module.exports = { registerSettingsEditorActions };
