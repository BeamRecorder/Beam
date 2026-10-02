import { validateComposition } from '@beam/engine';
import type { ExportRequest } from '@beam/encoder';
import { clipTextStyles } from '@beam/engine/shared/element-fonts';

/** Validate the independent render job before opening a codec/GPU backend. */
export function readExportRequest(value: unknown): ExportRequest {
  if (!value || typeof value !== 'object') throw new TypeError('Expected an export request.');
  const request = value as ExportRequest;
  const snapshot = request.snapshot;
  if (
    !['mp4', 'webm'].includes(request.format) ||
    !['low', 'medium', 'high'].includes(request.preset) ||
    typeof request.projectName !== 'string' ||
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
    !Array.isArray(snapshot.zooms) ||
    !snapshot.cursor ||
    !Array.isArray(snapshot.cursor.events) ||
    !Array.isArray(snapshot.cursor.telemetry) ||
    !snapshot.cursorSettings ||
    typeof snapshot.cursorSettings.enabled !== 'boolean'
  )
    throw new TypeError('Invalid export request or render settings.');
  validateComposition(snapshot.composition);
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
  for (const style of clipTextStyles(snapshot.composition.clips))
    if (style.fontAssetId && !snapshot.fontSources?.[style.fontAssetId])
      throw new Error(`Missing portable font source: ${style.fontAssetId}`);
  return request;
}
