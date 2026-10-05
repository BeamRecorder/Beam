const EDITOR_DEFAULT_SIZE = Object.freeze({ width: 1280, height: 800 });
const EDITOR_MIN_SIZE = Object.freeze({ width: 960, height: 600 });

/** Electron work areas and BrowserWindow bounds are already in logical pixels. */
function editorWindowBounds(saved, area, origin) {
  const size = { ...EDITOR_DEFAULT_SIZE };
  for (const key of ['width', 'height']) {
    if (Number.isFinite(saved?.[key]) && saved[key] >= EDITOR_MIN_SIZE[key]) size[key] = Math.round(saved[key]);
  }
  const minimum = { ...EDITOR_MIN_SIZE };
  if (area) {
    if (
      !['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(area[key])) ||
      area.width <= 0 ||
      area.height <= 0
    )
      throw new Error('The editor display has an invalid work area.');
    for (const key of ['width', 'height']) {
      size[key] = Math.min(size[key], area[key]);
      minimum[key] = Math.min(minimum[key], area[key]);
    }
  }
  const position = origin
    ? { x: origin.x + 24, y: origin.y + 24 }
    : area
      ? {
          x: area.x + Math.floor((area.width - size.width) / 2),
          y: area.y + Math.floor((area.height - size.height) / 2),
        }
      : {};
  if (area) {
    position.x = Math.min(Math.max(position.x, area.x), area.x + area.width - size.width);
    position.y = Math.min(Math.max(position.y, area.y), area.y + area.height - size.height);
  }
  return { ...position, ...size, minWidth: minimum.width, minHeight: minimum.height };
}

module.exports = { EDITOR_DEFAULT_SIZE, EDITOR_MIN_SIZE, editorWindowBounds };
