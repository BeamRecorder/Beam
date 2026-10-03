function scheduleHudAuxiliaryWarmup({ hudWindow, canAcceptWork, prepare, readiness = null }) {
  let disposed = false;
  let listening = false;
  const prepareVisibleHud = () => {
    if (!disposed && canAcceptWork() && !hudWindow.isDestroyed() && hudWindow.isVisible()) prepare();
  };
  const afterPresentation = () => {
    listening = false;
    if (readiness) {
      void readiness.then(prepareVisibleHud).catch((error) => console.error('[HUD auxiliary warmup]', error));
    } else prepareVisibleHud();
  };
  if (hudWindow.isVisible()) afterPresentation();
  else {
    listening = true;
    hudWindow.once('show', afterPresentation);
  }
  return () => {
    disposed = true;
    if (listening) hudWindow.removeListener('show', afterPresentation);
    listening = false;
  };
}

module.exports = { scheduleHudAuxiliaryWarmup };
