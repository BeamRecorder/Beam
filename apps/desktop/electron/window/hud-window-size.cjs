const DEFAULT_HUD_WINDOW_SIZE = Object.freeze({ width: 672, height: 268 });

function normalizeHudWindowSize(value) {
  if (value && value.width === DEFAULT_HUD_WINDOW_SIZE.width && value.height === DEFAULT_HUD_WINDOW_SIZE.height) {
    return { width: value.width, height: value.height };
  }
  return { ...DEFAULT_HUD_WINDOW_SIZE };
}

module.exports = { DEFAULT_HUD_WINDOW_SIZE, normalizeHudWindowSize };
