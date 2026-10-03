import type { CompositionSnapshot } from '../shared/render-document-types';
import { validateComposition } from '../commands/clip-composition-validation';
import { validateCanvas, validateBackground } from './presentation-validation';
import { assertJsonValue } from './json-value';
import { validateGlassHighlight } from '../zoom/glass-highlight-schema.js';

export function validateRenderDocument(snapshot: CompositionSnapshot) {
  assertJsonValue(snapshot);
  if (
    !snapshot ||
    !Number.isFinite(snapshot.duration) ||
    snapshot.duration <= 0 ||
    !snapshot.render ||
    !Number.isFinite(snapshot.render.fps) ||
    snapshot.render.fps <= 0 ||
    snapshot.render.fps > 240 ||
    !snapshot.canvas ||
    ![snapshot.canvas.width, snapshot.canvas.height].every(
      (value) => Number.isSafeInteger(value) && value >= 2 && value <= 16384,
    ) ||
    !Number.isFinite(snapshot.blurPercent) ||
    snapshot.blurPercent < 0 ||
    snapshot.blurPercent > 100 ||
    !Array.isArray(snapshot.zooms) ||
    !snapshot.cursor ||
    !Array.isArray(snapshot.cursor.events) ||
    !Array.isArray(snapshot.cursor.telemetry) ||
    !snapshot.cursorSettings ||
    typeof snapshot.cursorSettings.enabled !== 'boolean'
  )
    throw new TypeError('Invalid render document settings.');
  validateCanvas(snapshot.canvas);
  validateBackground(snapshot.background);
  const ids = new Set<string>();
  for (const zoom of snapshot.zooms) {
    if (
      !zoom ||
      typeof zoom.id !== 'string' ||
      !zoom.id ||
      ids.has(zoom.id) ||
      typeof zoom.sessionId !== 'string' ||
      ![zoom.startMs, zoom.endMs, zoom.focus?.cx, zoom.focus?.cy].every(Number.isFinite) ||
      zoom.startMs < 0 ||
      zoom.endMs <= zoom.startMs ||
      ![1, 2, 3, 4, 5, 6].includes(zoom.depth) ||
      !['auto', 'manual'].includes(zoom.mode)
    )
      throw new TypeError('Invalid zoom.');
    ids.add(zoom.id);
    validateGlassHighlight(zoom);
  }
  if (
    snapshot.fontSources !== undefined &&
    (!snapshot.fontSources ||
      typeof snapshot.fontSources !== 'object' ||
      Array.isArray(snapshot.fontSources) ||
      Object.entries(snapshot.fontSources).some(
        ([id, source]) => !/^[a-f\d]{64}$/.test(id) || typeof source !== 'string' || !source,
      ))
  )
    throw new TypeError('Invalid font sources.');
  for (const dimension of [snapshot.render.sourceWidth, snapshot.render.sourceHeight])
    if (dimension !== null && (!Number.isSafeInteger(dimension) || dimension < 1))
      throw new TypeError('Invalid source dimensions.');
  validateComposition(snapshot.composition);
}
