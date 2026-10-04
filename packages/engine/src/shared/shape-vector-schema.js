// Portable validation shared by document editing and Electron project storage.
export const MAX_VECTOR_NODES = 1024;
export const ARROW_MARKERS = ['none', 'triangle', 'open', 'circle'];
export const ARROW_VECTOR_PRESETS = [
  'solid',
  'line',
  'double',
  'curved',
  'elbow',
  'open',
  'round-start',
  'round-head',
  'open-double',
  'filled-left',
  'filled-up',
  'filled-down',
  'filled-double',
  'chevron',
  'notched',
  'wide',
  'slender',
  'bent-filled',
  'arc',
  'reverse-curve',
  's-curve',
  'wave',
  'hook',
  'u-turn',
  'zigzag',
  'loop',
  'elbow-double',
  'arc-double',
  'filled-curved',
  'swoosh',
];

const point = (value) => Boolean(value && [value.x, value.y].every((n) => Number.isFinite(n) && n >= -8 && n <= 8));
const node = (value) =>
  Boolean(
    point(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 80 &&
    ['corner', 'smooth'].includes(value.mode) &&
    (value.in === undefined || point(value.in)) &&
    (value.out === undefined || point(value.out)),
  );

export function isShapeVector(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.contours) ||
    !value.contours.length ||
    value.contours.length > 64 ||
    !['nonzero', 'evenodd'].includes(value.fillRule) ||
    !ARROW_MARKERS.includes(value.startMarker) ||
    !ARROW_MARKERS.includes(value.endMarker) ||
    !Number.isFinite(value.strokeWidth) ||
    value.strokeWidth < 1 ||
    value.strokeWidth > 120 ||
    !Number.isFinite(value.markerSize) ||
    value.markerSize < 1 ||
    value.markerSize > 120 ||
    (value.arrowPreset !== undefined && !ARROW_VECTOR_PRESETS.includes(value.arrowPreset))
  )
    return false;
  const ids = new Set();
  for (const contour of value.contours) {
    if (
      !contour ||
      typeof contour.closed !== 'boolean' ||
      !Array.isArray(contour.nodes) ||
      contour.nodes.length < 2 ||
      ids.size + contour.nodes.length > MAX_VECTOR_NODES
    )
      return false;
    for (const anchor of contour.nodes) {
      if (!node(anchor) || ids.has(anchor.id)) return false;
      ids.add(anchor.id);
    }
  }
  return true;
}
