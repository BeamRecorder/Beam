import {
  DEFAULT_ZOOM_TILT_HORIZONTAL,
  DEFAULT_ZOOM_TILT_VERTICAL,
  normalizeZoomTiltAxis,
  normalizeZoomTiltIntensity,
  type ZoomElement,
} from '@beam/engine/zoom/zoom-types';
import type { ZoomTiltDirectionPreset, ZoomTiltPresetDefinition } from '@beam/engine/zoom/zoom-tilt-preset-types';

export const ZOOM_TILT_PRESETS: readonly ZoomTiltPresetDefinition[] = [
  { id: 'tilt-back', labelKey: 'tiltBack', intensity: 0.6, horizontal: 0, vertical: 0.85 },
  { id: 'tilt-front', labelKey: 'tiltFront', intensity: 0.6, horizontal: 0, vertical: -0.85 },
  { id: 'tilt-left', labelKey: 'tiltLeft', intensity: 0.6, horizontal: -0.85, vertical: 0 },
  { id: 'tilt-right', labelKey: 'tiltRight', intensity: 0.6, horizontal: 0.85, vertical: 0 },
  { id: 'pull-back', labelKey: 'pullBack', intensity: 0.6, horizontal: -0.65, vertical: 0.35 },
  { id: 'pull-front', labelKey: 'pullFront', intensity: 0.6, horizontal: 0.65, vertical: -0.35 },
];

export function activeZoomTiltPreset(zoom: ZoomElement): ZoomTiltDirectionPreset | 'custom' {
  if (zoom.tiltPreset === 'custom') return 'custom';
  const intensity = normalizeZoomTiltIntensity(zoom.tiltIntensity);
  const horizontal = normalizeZoomTiltAxis(zoom.tiltHorizontal, DEFAULT_ZOOM_TILT_HORIZONTAL);
  const vertical = normalizeZoomTiltAxis(zoom.tiltVertical, DEFAULT_ZOOM_TILT_VERTICAL);
  const matches = (preset: ZoomTiltPresetDefinition) =>
    Math.abs(preset.intensity - intensity) < 1e-6 &&
    Math.abs(preset.horizontal - horizontal) < 1e-6 &&
    Math.abs(preset.vertical - vertical) < 1e-6;
  return (
    ZOOM_TILT_PRESETS.find(
      (preset) =>
        matches(preset) &&
        (zoom.tiltPreset === preset.id ||
          zoom.tiltPreset === undefined ||
          ['small', 'medium', 'large'].includes(zoom.tiltPreset)),
    )?.id ?? 'custom'
  );
}

export function applyZoomTiltPreset(zoom: ZoomElement, preset: ZoomTiltPresetDefinition): ZoomElement {
  return {
    ...zoom,
    projection: '3d',
    tiltPreset: preset.id,
    tiltIntensity: preset.intensity,
    tiltHorizontal: preset.horizontal,
    tiltVertical: preset.vertical,
  };
}
