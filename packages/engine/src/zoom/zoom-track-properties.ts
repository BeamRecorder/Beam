import type { ZoomElement } from './zoom-types';
import { validateZoomElement } from './zoom-schema';

const properties = [
  'depth',
  'mode',
  'effect',
  'glass',
  'projection',
  'transition',
  'orbitSettings',
  'tiltIntensity',
  'tiltHorizontal',
  'tiltVertical',
  'tiltPreset',
] as const satisfies readonly (keyof ZoomElement)[];

/** Share appearance without replacing each shot's target, recording link, provenance or timing. */
export function applyZoomTrackProperties(zooms: ZoomElement[], sourceId: string): ZoomElement[] {
  const source = zooms.find((zoom) => zoom.id === sourceId);
  if (!source || source.locked) return zooms;
  let changed = false;
  const next = zooms.map((zoom) => {
    if (zoom.locked || zoom.id === sourceId) return zoom;
    const result = { ...zoom };
    for (const key of properties) {
      if (source[key] === undefined) delete result[key];
      else Object.assign(result, { [key]: source[key] });
    }
    if (result.effect === 'glass')
      result.focus = { cx: Math.min(1, Math.max(0, result.focus.cx)), cy: Math.min(1, Math.max(0, result.focus.cy)) };
    if (JSON.stringify(result) === JSON.stringify(zoom)) return zoom;
    validateZoomElement(result);
    changed = true;
    return result;
  });
  return changed ? next : zooms;
}
