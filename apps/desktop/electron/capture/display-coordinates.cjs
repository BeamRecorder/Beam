const { x11DipBounds } = require('./x11-display-geometry.cjs');

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
  if (platform === 'linux' && /^x11:monitor:\d+:\d+$/.test(displayId)) {
    return x11DipBounds(screen, await requestNative('source-bounds', { source: displayId }));
  }
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

async function linuxDisplaySource(screen, requestNative, bounds) {
  const catalog = await requestNative('discover');
  if (catalog?.diagnostics?.linux?.backend !== 'x11') return 'portal:monitor';
  for (const source of catalog.sources) {
    if (source.kind !== 'display' || !/^x11:monitor:\d+:\d+$/.test(source.id)) continue;
    const physical = await requestNative('source-bounds', { source: source.id });
    const candidate = x11DipBounds(screen, physical);
    if (['x', 'y', 'width', 'height'].every((key) => candidate[key] === bounds[key])) return source.id;
  }
  throw new Error('The selected X11 monitor is no longer available');
}

module.exports = { nativeDisplayBounds, windowsDisplaySource, linuxDisplaySource };
