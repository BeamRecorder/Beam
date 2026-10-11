function registerWindowVisibilityIpc(ipcMain, windowForEvent) {
  const observed = new WeakSet();
  ipcMain.on('window:observe-visibility', (event) => {
    const window = windowForEvent(event);
    if (!window || window.isDestroyed()) return;
    const publish = () => {
      if (window.isDestroyed() || window.webContents.isDestroyed()) return;
      window.webContents.send('window:visibility', window.isVisible() && !window.isMinimized());
    };
    if (!observed.has(window)) {
      observed.add(window);
      const events = ['show', 'hide', 'minimize', 'restore'];
      for (const name of events) window.on(name, publish);
      window.once('closed', () => {
        for (const name of events) window.removeListener(name, publish);
      });
    }
    publish();
  });
}

module.exports = { registerWindowVisibilityIpc };
