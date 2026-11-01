import type { CompositionSnapshot } from '@beam/engine/shared/render-document-types';

/** Bounded authored settings, without media paths or recorded input/cursor data. */
export function exportZoomReport(snapshot: CompositionSnapshot, failureTimeMs?: number): string[] {
  const zooms = snapshot.zooms ?? [];
  const nearest =
    failureTimeMs === undefined
      ? zooms
      : [...zooms].sort((left, right) => {
          const distance = (zoom: typeof left) => Math.max(zoom.startMs - failureTimeMs, failureTimeMs - zoom.endMs, 0);
          return distance(left) - distance(right) || left.startMs - right.startMs;
        });
  if (!zooms.length && snapshot.zoomMotionBlur === undefined && snapshot.zoomAutoFollow === undefined) return [];
  return [
    '',
    '--- Camera & Zoom Settings ---',
    `Motion Blur: ${snapshot.zoomMotionBlur ? JSON.stringify(snapshot.zoomMotionBlur) : 'Unspecified'}`,
    `Auto Follow: ${snapshot.zoomAutoFollow ? JSON.stringify(snapshot.zoomAutoFollow) : 'Unspecified'}`,
    `Zoom Elements: ${zooms.length}; showing ${Math.min(12, zooms.length)} ${failureTimeMs === undefined ? 'in document order' : 'nearest the operation time (authored bounds)'}`,
    ...nearest
      .slice(0, 12)
      .map(
        ({
          id,
          enabled,
          startMs,
          endMs,
          projection,
          depth,
          mode,
          focus,
          timing,
          transition,
          effect,
          tiltPreset,
          tiltIntensity,
          tiltHorizontal,
          tiltVertical,
          orbitSettings,
        }) =>
          JSON.stringify({
            id,
            enabled,
            startMs,
            endMs,
            projection,
            depth,
            mode,
            focus,
            timing,
            transition,
            effect,
            tiltPreset,
            tiltIntensity,
            tiltHorizontal,
            tiltVertical,
            orbitSettings,
          }),
      ),
  ];
}
