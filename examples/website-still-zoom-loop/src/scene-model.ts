import { createManualZoom } from '../../../packages/engine/src/zoom/manual-zoom';
import { createGlassHighlight } from '../../../packages/engine/src/zoom/glass-highlight';
import { applyZoomTiltPreset, ZOOM_TILT_PRESETS } from '../../../packages/engine/src/zoom/zoom-tilt-presets';
import type { ScreenshotZoomLayer } from '@beam/engine/screenshot/screenshot-types';
import { phaseTime, styleAt } from './motion';
export const CANVAS = { preset: 'custom' as const, width: 1280, height: 720, showBackground: false };
export const PREVIEW = { x: 324, y: 125, width: 652, height: 366.75 };
export function selectedZoom(time: number): ScreenshotZoomLayer {
  const t = phaseTime(time), style = styleAt(t);
  const base: ScreenshotZoomLayer = { ...createManualZoom('still-detail', 0, 1), kind: 'zoom',
    name: 'Detail', mode: 'manual', enabled: true, depth: 2, focus: { cx: .66, cy: .5 } };
  if (style === '3d') {
    const preset = ZOOM_TILT_PRESETS.find(preset => preset.id === (t < 3.25 ? 'tilt-back' : 'tilt-left'))!;
    return { ...applyZoomTiltPreset(base, preset), kind: 'zoom', name: 'Detail', mode: 'manual', enabled: true,
      depth: 1, focus: { cx: .5, cy: .5 } };
  }
  if (style === 'glass') {
    const move = Math.max(0, Math.min(1, (t - 6.1) / .7));
    const appearance = Math.max(0, Math.min(1, (t - 7.5) / .6));
    return { ...base, effect: 'glass', depth: 3, focus: { cx: .72 - .1 * move, cy: .518 },
      glass: { ...createGlassHighlight(), shape: 'circle', size: .6, transitionMs: 0,
        refraction: .12 + .23 * appearance, rim: .32, shadow: .25, dispersion: .08 } };
  }
  const drag = Math.max(0, Math.min(1, (t - .55) / 1));
  return { ...base, focus: { cx: .65 - .1166 * drag, cy: .518 + .012 * drag } };
}
