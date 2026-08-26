function finiteRectangle(value) {
  if (!value || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]))) return null;
  if (value.width <= 0 || value.height <= 0) return null;
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function regionPixels(displayBounds, region) {
  const display = finiteRectangle(displayBounds);
  if (!display || !region) return null;
  const x = Math.max(0, Math.min(1, Number(region.x)));
  const y = Math.max(0, Math.min(1, Number(region.y)));
  const right = Math.max(x, Math.min(1, x + Number(region.width)));
  const bottom = Math.max(y, Math.min(1, y + Number(region.height)));
  return {
    x: Math.round(display.x + display.width * x),
    y: Math.round(display.y + display.height * y),
    width: Math.max(1, Math.round(display.width * (right - x))),
    height: Math.max(1, Math.round(display.height * (bottom - y))),
  };
}

function placeCropBar({ displayBounds, workArea, region, barSize, gap = 10 }) {
  const display = finiteRectangle(displayBounds);
  const available = finiteRectangle(workArea) || display;
  const selected = regionPixels(display, region);
  const size = finiteRectangle({ x: 0, y: 0, ...barSize });
  if (!display || !available || !selected || !size) throw new Error('Quick Snip window geometry is invalid.');
  const minX = available.x;
  const maxX = available.x + available.width - size.width;
  const minY = available.y;
  const maxY = available.y + available.height - size.height;
  const x = Math.round(Math.max(minX, Math.min(maxX, selected.x + (selected.width - size.width) / 2)));
  const below = selected.y + selected.height + gap;
  const above = selected.y - size.height - gap;
  if (below <= maxY) return { bounds: { x, y: below, width: size.width, height: size.height }, outside: true };
  if (above >= minY) return { bounds: { x, y: above, width: size.width, height: size.height }, outside: true };
  return {
    bounds: { x, y: Math.max(minY, Math.min(maxY, below)), width: size.width, height: size.height },
    outside: false,
  };
}

module.exports = { placeCropBar, regionPixels };
