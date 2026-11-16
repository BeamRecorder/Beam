function x11DipBounds(screen, bounds) {
  if (
    !bounds ||
    !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key])) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    throw new Error('The X11 source has invalid physical bounds');
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const displays = screen.getAllDisplays();
  const display = displays.find((item) => {
    const origin = item.nativeOrigin;
    return (
      origin &&
      Number.isFinite(item.scaleFactor) &&
      item.scaleFactor > 0 &&
      x >= origin.x &&
      y >= origin.y &&
      x < origin.x + item.bounds.width * item.scaleFactor &&
      y < origin.y + item.bounds.height * item.scaleFactor
    );
  });
  if (!display) throw new Error('The X11 source could not be matched to a desktop display');
  const scale = display.scaleFactor;
  return {
    x: Math.round(display.bounds.x + (bounds.x - display.nativeOrigin.x) / scale),
    y: Math.round(display.bounds.y + (bounds.y - display.nativeOrigin.y) / scale),
    width: Math.max(1, Math.round(bounds.width / scale)),
    height: Math.max(1, Math.round(bounds.height / scale)),
  };
}
module.exports = { x11DipBounds };
