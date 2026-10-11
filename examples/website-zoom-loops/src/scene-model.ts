import { createDefaultClipAppearance } from '../../../packages/engine/src/shared/composition-defaults';
import { applyZoomTiltPreset, ZOOM_TILT_PRESETS } from '../../../packages/engine/src/zoom/zoom-tilt-presets';
import type { VisualClip } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import { phaseTime } from './motion';
import type { DemoMode } from './demo-types';

export function previewClip(): VisualClip {
  return {
    id: 'capture',
    name: 'Beautiful Captures',
    kind: 'image',
    assetId: 'capture',
    enabled: true,
    order: 0,
    timelineStartMs: 0,
    timelineDurationMs: 8000,
    sourceInMs: 0,
    sourceDurationMs: 8000,
    playbackRate: 1,
    transform: { x: 0, y: 0, width: 1, height: 1 },
    appearance: createDefaultClipAppearance('image'),
    isMirrored: false,
    isMirroredY: false,
  };
}
export function zoomElements(mode: DemoMode): ZoomElement[] {
  const base: ZoomElement[] = [
    {
      id: 'first-zoom',
      sessionId: 'capture',
      startMs: 1100,
      endMs: 3100,
      focus: { cx: 0.66, cy: 0.48 },
      depth: 3,
      mode: 'manual',
      projection: '2d',
    },
    {
      id: 'second-zoom',
      sessionId: 'capture',
      startMs: 3800,
      endMs: 5500,
      focus: { cx: 0.28, cy: 0.44 },
      depth: 4,
      mode: 'manual',
      projection: '2d',
    },
  ];
  if (mode === '2d') return base;
  return base.map((zoom, index) =>
    applyZoomTiltPreset(
      { ...zoom, depth: 2, focus: { cx: 0.5, cy: 0.5 } },
      ZOOM_TILT_PRESETS.find((preset) => preset.id === (index === 0 ? 'tilt-left' : 'pull-front'))!,
    ),
  );
}
export function selectedZoom(mode: DemoMode, time: number) {
  const t = phaseTime(time),
    zoom = zoomElements(mode)[t >= 3.4 ? 1 : 0]!;
  if (mode === '3d' && t < 0.8) {
    return applyZoomTiltPreset(
      zoom,
      ZOOM_TILT_PRESETS.find((preset) => preset.id === 'tilt-back')!,
    );
  }
  return zoom;
}
