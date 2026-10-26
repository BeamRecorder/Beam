const PREPARATION_SIZE = { width: 800, height: 88 };
function applyPreparationMaterial(window, platform, active) {
  if (platform === 'darwin') window.setVibrancy?.(active ? 'under-window' : null);
  // Windows must retain its original transparent surface across mode changes.
}
function fitPreparationBar(controller, screen, contentWidth, beforeResize = () => {}) {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0 || contentWidth > 2000)
    throw new TypeError('Invalid recording preparation width.');
  const window = controller.window;
  const bounds = window.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const width = Math.min(workArea.width, 1200, Math.max(352, Math.ceil(contentWidth) + 32));
  const size = { width, height: PREPARATION_SIZE.height };
  controller.preparationSize = size;
  const x = Math.max(
    workArea.x,
    Math.min(Math.round(bounds.x + (bounds.width - width) / 2), workArea.x + workArea.width - width),
  );
  if (bounds.width !== width || bounds.x !== x || bounds.height !== size.height) {
    const next = { ...bounds, x, ...size };
    beforeResize(next);
    window.setMinimumSize(width, size.height);
    window.setBounds(next);
  }
  return width;
}
module.exports = { PREPARATION_SIZE, applyPreparationMaterial, fitPreparationBar };
