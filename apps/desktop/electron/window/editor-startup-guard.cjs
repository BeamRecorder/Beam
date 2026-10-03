const EDITOR_OPEN_TIMEOUT_MS = 30_000;

function editorStartupError(session, code, message) {
  const stage = session.lastProgressStage || 'openingWindow';
  const progress = Number.isFinite(session.lastProgressValue) ? session.lastProgressValue : 0;
  const stageAgeMs = session.lastProgressAt ? Math.max(0, Date.now() - session.lastProgressAt) : null;
  const error = new Error(
    [
      `${code}: ${message}`,
      `Last confirmed step: ${stage} (${progress}%).`,
      `Time since this step started: ${stageAgeMs === null ? 'unknown' : `${stageAgeMs} ms`}.`,
      `Editor document loaded: ${session.documentLoaded ? 'yes' : 'no'}.`,
    ].join('\n'),
  );
  error.code = code;
  return error;
}

function editorTimeoutError(session) {
  return editorStartupError(session, 'BEAM_EDITOR_TIMEOUT', 'The editor did not finish opening within 30 seconds.');
}

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
    if (isMainFrame !== false && code !== -3)
      fail(editorStartupError(session, 'BEAM_EDITOR_LOAD_FAILED', `Editor loading failed (${code}): ${description}`));
  });
  session.window.webContents.on('render-process-gone', (_event, details) => {
    fail(editorStartupError(session, 'BEAM_EDITOR_RENDERER_GONE', `Editor renderer stopped: ${details.reason}`));
  });
  session.window.on('unresponsive', () =>
    fail(
      editorStartupError(session, 'BEAM_EDITOR_UNRESPONSIVE', 'The editor window stopped responding while opening.'),
    ),
  );
  return {
    clear,
    fail,
    start() {
      clear();
      timer = setTimeout(() => fail(editorTimeoutError(session)), EDITOR_OPEN_TIMEOUT_MS);
      timer.unref?.();
    },
  };
}
module.exports = { createEditorStartupGuard, editorTimeoutError };
