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

const STATUS_SIZE = { width: 380, height: 184 };
const PILL_SIZE = { width: 356, height: 76 };
const STATUS_MARGIN = 12;
const STATUS_DETAILS_SPACE = STATUS_SIZE.height - PILL_SIZE.height - STATUS_MARGIN * 2;
const clamp = (value, min, max) => Math.round(Math.max(min, Math.min(Math.max(min, max), value)));

function restoreWindowPosition(preferencesStore, key, display, size) {
  const saved = preferencesStore?.read()?.extras?.[key]?.[String(display.id)];
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return null;
  const area = display.workArea;
  return {
    x: clamp(saved.x, area.x, area.x + area.width - size.width),
    y: clamp(saved.y, area.y, area.y + area.height - size.height),
    ...size,
  };
}

function saveWindowPosition(preferencesStore, key, display, position) {
  if (!preferencesStore || !display || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  const stored = preferencesStore.read()?.extras?.[key];
  const positions = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const next = { x: Math.round(position.x), y: Math.round(position.y) };
  const previous = positions[String(display.id)];
  if (previous?.x === next.x && previous?.y === next.y) return;
  preferencesStore.patch({ extras: { [key]: { ...positions, [String(display.id)]: next } } });
}

function statusPillPosition(bounds, popoverSide) {
  return {
    x: bounds.x + STATUS_MARGIN,
    y: bounds.y + STATUS_MARGIN + (popoverSide === 'above' ? STATUS_DETAILS_SPACE : 0),
  };
}

function placeStatusPill({ position, workArea }) {
  const area = finiteRectangle(workArea);
  if (!area || !Number.isFinite(position?.x) || !Number.isFinite(position?.y))
    throw new Error('Quick Snip status geometry is invalid.');
  const x = clamp(position.x, area.x + STATUS_MARGIN, area.x + area.width - PILL_SIZE.width - STATUS_MARGIN);
  const y = clamp(position.y, area.y + STATUS_MARGIN, area.y + area.height - PILL_SIZE.height - STATUS_MARGIN);
  const above = y - area.y - STATUS_MARGIN;
  const below = area.y + area.height - y - PILL_SIZE.height - STATUS_MARGIN;
  const popoverSide = below > above ? 'below' : 'above';
  const bounds = {
    x: x - STATUS_MARGIN,
    y: clamp(
      y - STATUS_MARGIN - (popoverSide === 'above' ? STATUS_DETAILS_SPACE : 0),
      area.y,
      area.y + area.height - STATUS_SIZE.height,
    ),
    ...STATUS_SIZE,
  };
  return { bounds, popoverSide, position: statusPillPosition(bounds, popoverSide) };
}

module.exports = {
  placeCropBar,
  regionPixels,
  restoreWindowPosition,
  saveWindowPosition,
  statusPillPosition,
  placeStatusPill,
  STATUS_SIZE,
  PILL_SIZE,
};
