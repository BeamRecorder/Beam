import { CURSOR_MOTION_PRESETS } from './recordly/cursorMotionPresets';
import { normalizeRecordlyZoom } from './recordly-settings-schema.js';
import type { RecordlyZoomSettings, RecordlyZoomPreset } from './recordly-settings-types';
import type { ZoomAutoFollowSettings } from './zoom-types';

/** The Zoom preset action upstream changes durations and Classic, independently of cursor appearance. */
export function applyRecordlyZoomPreset(value: RecordlyZoomSettings, preset: RecordlyZoomPreset): RecordlyZoomSettings {
  return {
    ...value,
    zoomInDurationMs: CURSOR_MOTION_PRESETS[preset].zoomInDurationMs,
    zoomOutDurationMs: CURSOR_MOTION_PRESETS[preset].zoomOutDurationMs,
    zoomClassicMode: false,
  };
}
export function recordlyZoomPreset(value: RecordlyZoomSettings): RecordlyZoomPreset | null {
  if (value.zoomClassicMode) return null;
  return (
    (['focused', 'smooth'] as const).find(
      (preset) =>
        CURSOR_MOTION_PRESETS[preset].zoomInDurationMs === value.zoomInDurationMs &&
        CURSOR_MOTION_PRESETS[preset].zoomOutDurationMs === value.zoomOutDurationMs,
    ) ?? null
  );
}
export const cameraZoomsBackground = (value?: ZoomAutoFollowSettings) =>
  value?.zoomBackground ?? value?.experimentalZoom !== true;
export { normalizeRecordlyZoom };
