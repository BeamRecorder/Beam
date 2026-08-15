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
  processTarget.on('unhandledRejection', (reason) => exitAfterShutdown('fatal', `Unhandled rejection: ${reason}`));
  powerMonitor.on('shutdown', requestQuit);
  app.on('render-process-gone', (_event, contents, details) =>
    exitAfterShutdown(
      'renderer-crash',
      `renderer ${contents?.id ?? 'unknown'} exited (${details.reason}, code=${details.exitCode})`,
    ),
  );
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return false;
    return exitAfterShutdown(
      'fatal',
      `Electron ${details.type} process exited (${details.reason}, code=${details.exitCode})`,
    );
  });
}

module.exports = { registerFatalLifecycle };
