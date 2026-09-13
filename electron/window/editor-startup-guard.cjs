const EDITOR_OPEN_TIMEOUT_MS = 30_000;

function createEditorStartupGuard(session) {
  let timer = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const fail = (error) => {
    if (!session.rejectPresentation || session.window.isDestroyed()) return;
    clear();
    const reject = session.rejectPresentation;
    session.resolvePresentation = null;
    session.rejectPresentation = null;
    // Startup failure never owns the application's Quit action.
    session.returningToHud = true;
    session.window.destroy();
    reject(error);
  };
  session.window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame !== false && code !== -3) fail(new Error(`Editor loading failed (${code}): ${description}`));
  });
  session.window.webContents.on('render-process-gone', (_event, details) => {
    fail(new Error(`Editor renderer stopped: ${details.reason}`));
  });
  session.window.on('unresponsive', () => fail(new Error('The editor stopped responding while opening the project.')));
  return {
    clear,
    fail,
    start() {
      clear();
      timer = setTimeout(
        () => fail(new Error('The editor did not finish opening the project within 30 seconds.')),
        EDITOR_OPEN_TIMEOUT_MS,
      );
      timer.unref?.();
    },
  };
}
module.exports = { createEditorStartupGuard };
