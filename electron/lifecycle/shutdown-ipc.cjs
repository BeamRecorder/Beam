function shutdownError() {
  const error = new Error('Beam is shutting down; new IPC work is disabled');
  error.code = 'application-shutting-down';
  return error;
}

function createShutdownAwareIpc(ipcMain, canAcceptWork) {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, (...args) => {
        if (!canAcceptWork()) throw shutdownError();
        return listener(...args);
      });
    },
    on(channel, listener) {
      ipcMain.on(channel, (...args) => {
        if (!canAcceptWork()) return false;
        return listener(...args);
      });
    },
  };
}

module.exports = { createShutdownAwareIpc, shutdownError };
