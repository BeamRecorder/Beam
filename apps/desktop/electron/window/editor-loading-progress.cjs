const EDITOR_LOADING_PROGRESS = Object.freeze({
  openingWindow: 10,
  loadingEditor: 20,
  loadingAppearance: 30,
  loadingProject: 45,
  loadingTimeline: 60,
  loadingEditorModule: 75,
  initializingEditor: 82,
  renderingEditor: 90,
  loadingPreview: 95,
  ready: 100,
});

function createEditorProgressReporter(hudWindow, isPresenting) {
  return (session, stage) => {
    if (typeof stage !== 'string' || !Object.hasOwn(EDITOR_LOADING_PROGRESS, stage)) return false;
    const value = EDITOR_LOADING_PROGRESS[stage];
    if (!isPresenting(session) || value === undefined || value < session.lastProgressValue) return false;
    if (session.lastProgressStage !== stage) session.lastProgressAt = Date.now();
    session.lastProgressValue = value;
    session.lastProgressStage = stage;
    if (hudWindow.isDestroyed()) return false;
    hudWindow.webContents.send('editor:loading-progress', { stage, value });
    return true;
  };
}

module.exports = { createEditorProgressReporter };
