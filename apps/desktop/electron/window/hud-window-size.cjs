const DEFAULT_HUD_WINDOW_SIZE = Object.freeze({ width: 672, height: 268 });

function normalizeHudWindowSize(value) {
  if (value && value.width === DEFAULT_HUD_WINDOW_SIZE.width && value.height === DEFAULT_HUD_WINDOW_SIZE.height) {
    return { width: value.width, height: value.height };
  }
  return { ...DEFAULT_HUD_WINDOW_SIZE };
}

function restoreHudWindowSize(window, mode, size = DEFAULT_HUD_WINDOW_SIZE) {
  if (mode !== 'hud' || window.isDestroyed()) return;
  const bounds = window.getBounds();
  // Preserve an open popover while repairing native display/restore resizes.
  const height = Math.max(size.height, Math.min(bounds.height, 720));
  if (bounds.width !== size.width || bounds.height !== height) {
    window.setSize(size.width, height);
  }
}

module.exports = { DEFAULT_HUD_WINDOW_SIZE, normalizeHudWindowSize, restoreHudWindowSize };
