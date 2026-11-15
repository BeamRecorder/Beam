import { compileSceneComposition } from '../../scene/scene-clock';
import type { ClipComposition } from '../../shared/composition-types';
import type { CursorTelemetryPoint as BeamPoint } from '../../capture/capture-session';
import type { CursorTelemetryPoint, ClipRegion } from '../recordly/types';

/** Only host identities and session offsets are adapted; Recordly owns timeline projection. */
export function recordlyCompositionClips(composition: ClipComposition): ClipRegion[] {
  composition = compileSceneComposition(composition);
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  return composition.clips.flatMap((clip) => {
    if (clip.kind !== 'screen' || clip.enabled === false) return [];
    const asset = assets.get(clip.assetId);
    if (!asset) return [];
    return [
      {
        id: clip.id,
        startMs: clip.timelineStartMs,
        endMs: clip.timelineStartMs + clip.timelineDurationMs,
        sourceStartMs: (asset.sessionStartMs ?? 0) + clip.sourceInMs,
        speed: clip.playbackRate,
      },
    ];
  });
}
export function recordlyTelemetry(points: readonly (BeamPoint & { mouseButton?: number })[]): CursorTelemetryPoint[] {
  return points.map((point) => ({
    timeMs: point.timeMs,
    cx: point.cx,
    cy: point.cy,
    interactionType: point.interactionType,
    ...([1, 2, 3].includes(point.mouseButton ?? 0) ? { mouseButton: point.mouseButton as 1 | 2 | 3 } : {}),
    ...(point.cursorType &&
    [
      'arrow',
      'text',
      'pointer',
      'crosshair',
      'open-hand',
      'closed-hand',
      'resize-ew',
      'resize-ns',
      'not-allowed',
    ].includes(point.cursorType)
      ? { cursorType: point.cursorType as CursorTelemetryPoint['cursorType'] }
      : {}),
  }));
}
