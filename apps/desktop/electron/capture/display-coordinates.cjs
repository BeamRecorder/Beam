async function windowsDisplaySource(screen, requestNative, bounds) {
  const point = screen.dipToScreenPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });
  const source = await requestNative('resolve-display', point);
  if (
    typeof source !== 'string' ||
    !source.startsWith('wgc:monitor:') ||
    source === 'wgc:monitor:' ||
    source.length > 1024
  )
    throw new Error('The native display lookup returned an invalid source.');
  return source;
}

async function nativeDisplayBounds(screen, requestNative, displayId, platform) {
  if (typeof displayId !== 'string' || !displayId.length || displayId.length > 128) return null;
  const displays = screen.getAllDisplays();
  let display = displays.find((item) => String(item.id) === displayId);
  // Rust identifies Windows monitors by device name; Electron exposes numeric IDs.
  // Match physical centers through Rust instead of multiplying mixed-DPI origins.
  if (!display && platform === 'win32') {
    for (const candidate of displays) {
      const source = await windowsDisplaySource(screen, requestNative, candidate.bounds);
      if (source === `wgc:monitor:${displayId}`) {
        display = candidate;
        break;
      }
    }
  }
  const bounds = display?.bounds;
  if (
    !bounds ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key])) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

module.exports = { nativeDisplayBounds, windowsDisplaySource };
