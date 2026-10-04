function registerFatalLifecycle({ app, powerMonitor, coordinator, log = () => {}, processTarget = process }) {
  const exitAfterShutdown = (source, details) => {
    if (!coordinator.canAcceptWork()) return false;
    log(`${source}: ${details}`);
    coordinator.requestShutdown(source).finally(() => app.exit(1));
    return true;
  };
  const requestQuit = () => {
    if (coordinator.canAcceptWork()) app.quit();
  };

  processTarget.on('SIGINT', requestQuit);
  processTarget.on('SIGTERM', requestQuit);
  processTarget.on('uncaughtException', (error) =>
    exitAfterShutdown('fatal', `Uncaught exception: ${error?.stack || error}`),
  );
  processTarget.on('unhandledRejection', (reason) => {
    if (!coordinator.canAcceptWork() && String(reason?.message || reason).includes('Object has been destroyed')) {
      log(`Ignored destroyed object rejection: ${reason}`);
      return;
    }
    exitAfterShutdown('fatal', `Unhandled rejection: ${reason}`);
  });
  powerMonitor.on('shutdown', requestQuit);
  app.on('render-process-gone', (_event, contents, details) => {
    if (!coordinator.canAcceptWork()) return;
    exitAfterShutdown(
      'renderer-crash',
      `renderer ${rendererId(contents)} exited (${details.reason}, code=${details.exitCode})`,
    );
  });
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return false;
    return exitAfterShutdown(
      'fatal',
      `Electron ${details.type} process exited (${details.reason}, code=${details.exitCode})`,
    );
  });
}

function rendererId(contents) {
  try {
    return contents?.isDestroyed?.() ? 'unknown' : (contents?.id ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

module.exports = { registerFatalLifecycle };
