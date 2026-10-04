import { validateGlassHighlight } from './glass-highlight-schema.js';

export function validateZoomElement(zoom) {
  if (
    !zoom ||
    typeof zoom.id !== 'string' ||
    !zoom.id ||
    typeof zoom.sessionId !== 'string' ||
    ![zoom.startMs, zoom.endMs, zoom.focus?.cx, zoom.focus?.cy].every(Number.isFinite) ||
    zoom.startMs < 0 ||
    zoom.endMs <= zoom.startMs ||
    ![1, 2, 3, 4, 5, 6].includes(zoom.depth) ||
    !['auto', 'manual'].includes(zoom.mode) ||
    (zoom.enabled !== undefined && typeof zoom.enabled !== 'boolean') ||
    (zoom.projection !== undefined && !['2d', '3d'].includes(zoom.projection)) ||
    ['tiltIntensity', 'tiltHorizontal', 'tiltVertical'].some(
      (key) => zoom[key] !== undefined && !Number.isFinite(zoom[key]),
    )
  )
    throw new TypeError('Invalid zoom.');
  validateGlassHighlight(zoom);
}

export function validateStillZoom(zoom) {
  validateZoomElement(zoom);
  if (
    zoom.kind !== 'zoom' ||
    zoom.mode !== 'manual' ||
    zoom.startMs !== 0 ||
    zoom.endMs !== 1 ||
    typeof zoom.name !== 'string' ||
    zoom.name.length > 200 ||
    typeof zoom.enabled !== 'boolean'
  )
    throw new TypeError('Still zooms must be manual, static composition layers.');
  if (['animations', 'animation', 'keyframes', 'transitions'].some((key) => key in zoom))
    throw new TypeError('Still zooms cannot contain animations.');
}
