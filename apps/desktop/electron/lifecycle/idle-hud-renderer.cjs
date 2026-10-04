const STANDBY_URL =
  'data:text/html;charset=utf-8,%3Chtml%3E%3Chead%3E%3Ctitle%3EBeam%3C/title%3E%3C/head%3E%3Cbody%3E%3C/body%3E%3C/html%3E';

function createIdleHudRenderer({
  window,
  controller,
  canSuspend,
  releaseAuxiliary,
  delayMs = 1000,
  log = console.error,
}) {
  let timer = null;
  let generation = 0;
  let suspended = false;
  let originalUrl = null;
  let resuming = null;
  let disposed = false;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    generation++;
  };
  const schedule = () => {
    cancel();
    if (disposed || window.isDestroyed() || window.isVisible() || controller.mode !== 'hud' || suspended) return;
    const current = generation;
    timer = setTimeout(async () => {
      timer = null;
      try {
        if (current !== generation || !canSuspend() || window.isVisible() || controller.mode !== 'hud') return;
        if ((await releaseAuxiliary()) === false) return;
        if (current !== generation || disposed || window.isDestroyed() || window.isVisible() || !canSuspend()) return;
        originalUrl = window.webContents.getURL();
        if (!originalUrl || originalUrl === STANDBY_URL) return;
        suspended = true;
        await window.loadURL(STANDBY_URL);
      } catch (error) {
        if (current === generation && !disposed) log('[Beam standby]', error);
      }
    }, delayMs);
    timer.unref?.();
  };
  const resume = () => {
    cancel();
    if (resuming) return resuming;
    if (!suspended || disposed || window.isDestroyed()) return Promise.resolve();
    resuming = window
      .loadURL(originalUrl)
      .then(() => {
        suspended = false;
      })
      .finally(() => {
        resuming = null;
      });
    return resuming;
  };
  window.on('hide', schedule);
  window.on('show', cancel);
  window.on('closed', cancel);
  controller.rendererLifecycle = { isSuspended: () => suspended, resume };
  return {
    schedule,
    resume,
    isSuspended: () => suspended,
    destroy() {
      disposed = true;
      cancel();
      window.removeListener('hide', schedule);
      window.removeListener('show', cancel);
      window.removeListener('closed', cancel);
      controller.rendererLifecycle = null;
    },
  };
}
module.exports = { createIdleHudRenderer, STANDBY_URL };
