function initializeSingleInstance({ app, initialize, restoreHud }) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => restoreHud());
  initialize();
  return true;
}

module.exports = { initializeSingleInstance };
