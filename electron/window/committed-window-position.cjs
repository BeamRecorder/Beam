const POSITION_COMMIT_DELAY_MS = 350;
const samePosition = (left, right) => left && right && left.x === right.x && left.y === right.y;

function createCommittedWindowPosition({
  window,
  platform = process.platform,
  environment = process.env,
  onMove = () => {},
  onCommit,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let programmatic = null;
  let observed = null;
  let pending = null;
  let timer = null;
  let disposed = false;
  const clearPendingTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const flush = () => {
    clearPendingTimer();
    if (disposed || !pending) return;
    const bounds = pending;
    pending = null;
    try {
      onCommit(bounds);
    } catch (error) {
      console.warn('[Beam window] Unable to save window position:', error);
    }
  };
  const remember = () => {
    if (disposed || window.isDestroyed() || !window.isVisible()) return;
    const bounds = window.getBounds();
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return;
    // Wayland withholds global coordinates. Preserve the last usable preference
    // instead of replacing it with the compositor's synthetic origin.
    if (platform === 'linux' && environment.WAYLAND_DISPLAY && bounds.x === 0 && bounds.y === 0) return;
    if (samePosition(bounds, programmatic) || samePosition(bounds, observed)) return;
    programmatic = null;
    observed = { ...bounds };
    pending = { ...bounds };
    onMove({ ...bounds });
    if (platform !== 'win32') {
      clearPendingTimer();
      timer = setTimer(flush, POSITION_COMMIT_DELAY_MS);
    }
  };
  const moved = () => {
    remember();
    // macOS aliases moved to move; only Windows supplies a separate commit.
    if (platform === 'win32') flush();
  };
  window.on('move', remember);
  window.on('moved', moved);

  return {
    trackProgrammatic(bounds) {
      clearPendingTimer();
      pending = null;
      programmatic = { ...bounds };
      observed = { ...bounds };
    },
    flush,
    dispose() {
      clearPendingTimer();
      disposed = true;
      pending = null;
      window.removeListener?.('move', remember);
      window.removeListener?.('moved', moved);
    },
  };
}

module.exports = { createCommittedWindowPosition, POSITION_COMMIT_DELAY_MS };
