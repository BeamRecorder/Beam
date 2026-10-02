const { DEFAULT_HUD_WINDOW_SIZE } = require('./hud-window-size.cjs');

function resizeHudPopover(win, controller, screen, requestedHeight, platform = process.platform) {
  if (!win || win.isDestroyed() || controller?.mode !== 'hud') return null;
  if (!Number.isFinite(requestedHeight)) throw new Error('Invalid HUD popover height.');
  const bounds = win.getBounds();
  if (platform === 'linux') return bounds.height;
  const { workArea } = screen.getDisplayMatching(bounds);
  const available = workArea.y + workArea.height - bounds.y;
  const height = Math.max(DEFAULT_HUD_WINDOW_SIZE.height, Math.min(Math.ceil(requestedHeight), available, 720));
  if (bounds.height !== height) win.setSize(DEFAULT_HUD_WINDOW_SIZE.width, height);
  return height;
}

module.exports = { resizeHudPopover };
