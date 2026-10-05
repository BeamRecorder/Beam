import { buildAutomaticGlassElements } from '../../../packages/engine/src/zoom/glass-generation';
import { createGlassHighlight, fitGlassContour } from '../../../packages/engine/src/zoom/glass-highlight';
import { createDefaultClipAppearance } from '../../../packages/engine/src/shared/composition-defaults';
import type { CursorTelemetryPoint } from '@beam/engine/capture/capture-session';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { DemoKind } from './demo-types';
import telemetry from '../assets/recorded-telemetry.json';
import recording from '../assets/recording.json';
export const recordedTelemetry: CursorTelemetryPoint[] = telemetry.samples.map((sample) => ({
  ...sample,
  interactionType: sample.interactionType as CursorTelemetryPoint['interactionType'],
  cy: (sample.cy * recording.sourceHeight - recording.cropTop) / (recording.sourceHeight - recording.cropTop),
}));
export const automaticLenses = buildAutomaticGlassElements({
  telemetry: recordedTelemetry, sessionId: recording.sessionId, durationMs: recording.durationMs,
  width: 1280, height: 680, reserved: [],
});
// Authored drawing points; the native engine fits the saved editable contour.
export const contour = Array.from({ length: 65 }, (_, i) => {
  const angle = (i / 64) * Math.PI * 2;
  return { x: (282 + Math.cos(angle) * (202 + Math.sin(angle * 3) * 8)) / 1280,
    y: (478 + Math.sin(angle) * 85) / 720 };
});
const fitted = fitGlassContour(contour, 1280, 720)!;
export function manualLens(time: number): ZoomElement {
  const freehand = time >= 1.8 && time < 9.5;
  const drawn = time >= 3.45 && time < 9.5;
  const refraction = .18 + .22 * Math.max(0, Math.min(1, (time - 5.1) / .8));
  const rim = .28 + .32 * Math.max(0, Math.min(1, (time - 6.6) / .8));
  return {
    id: 'hand-drawn-lens', sessionId: 'beautiful-captures', startMs: 0, endMs: 10000,
    effect: 'glass', enabled: true, mode: 'manual', depth: drawn ? 3 : 4,
    focus: drawn ? fitted.focus : { cx: .655, cy: .50 },
    glass: { ...createGlassHighlight(), transitionMs: 0, size: drawn ? fitted.size : .64,
      shape: freehand ? 'freehand' : 'circle', path: drawn ? fitted.path : [],
      refraction: time >= 9.5 ? .18 : refraction, rim: time >= 9.5 ? .28 : rim },
  };
}
export function sourceTime(time: number) {
  if (time < 3.35 || time >= 9.5) return 0;
  if (time >= 7.4) return 2700;
  return Math.min(8500, (time - 3.35) * 2150);
}
export function lensesAt(kind: DemoKind, time: number) {
  if (kind === 'glass') return [manualLens(time)];
  if (time < 3.35 || time >= 9.5) return [];
  return automaticLenses.map((lens, index) => ({
    ...lens, depth: index === 0 && time >= 8.05 ? 5 as const : lens.depth,
  }));
}
export function selectedLens(kind: DemoKind, time: number) {
  return kind === 'glass' ? manualLens(time) : time >= 7.4 && time < 9.5 ? lensesAt(kind, time)[0]! : null;
}
export function recordingCursor(timeMs: number) {
  const samples = recordedTelemetry;
  const index = samples.findIndex((sample) => sample.timeMs >= timeMs);
  if (index === 0) return samples[0]!;
  if (index < 0) return samples.at(-1)!;
  const a = samples[index - 1]!, b = samples[index]!;
  const mix = (timeMs - a.timeMs) / Math.max(1, b.timeMs - a.timeMs);
  return { timeMs, cx: a.cx + (b.cx - a.cx) * mix, cy: a.cy + (b.cy - a.cy) * mix };
}
export function previewClip(kind: DemoKind): VisualClip {
  return { id: 'capture', assetId: 'capture', kind: 'image', name: kind === 'glass' ? 'Beautiful Captures' : 'Quiet Aurora 4',
    enabled: true, order: 0, timelineStartMs: 0, timelineDurationMs: kind === 'glass' ? 10000 : 8600,
    sourceInMs: 0, sourceDurationMs: 10000, playbackRate: 1,
    transform: { x: 0, y: 0, width: 1, height: 1 }, appearance: createDefaultClipAppearance('image'),
    isMirrored: false, isMirroredY: false };
}
