/** Host-boundary normalization of the pinned Recordly settings. Shared with Electron JSON storage. */
export const RECORDLY_ZOOM_DEFAULTS = Object.freeze({
  zoomInDurationMs: 200,
  zoomOutDurationMs: 200 / 0.7,
  zoomSmoothness: 0.5,
  zoomClassicMode: false,
  connectZooms: true,
  connectedZoomGapMs: 1500,
  connectedZoomDurationMs: 1000,
  cameraSpringStiffnessMultiplier: 1,
  cameraSpringDampingMultiplier: 1.13,
  cameraSpringMassMultiplier: 1.12,
  defaultDurationMs: 2000,
  zoomMotionBlur: 0.35,
  loopCursor: false,
  zoomMotionBlurTuning: Object.freeze({
    panVelocityThreshold: 0,
    zoomVelocityThreshold: 0,
    maxDirectionalBlurPx: 41.8,
    maxRadialBlurStrength: 1,
    panResponsePerSecond: 11,
    zoomResponsePerSecond: 9,
    zoomSafeZoneRadiusPx: 6,
  }),
});
const number = (value, fallback, min, max) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const boolean = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
export function normalizeRecordlyZoom(value) {
  const input = value && typeof value === 'object' ? value : {};
  const d = RECORDLY_ZOOM_DEFAULTS;
  const tuning =
    input.zoomMotionBlurTuning && typeof input.zoomMotionBlurTuning === 'object' ? input.zoomMotionBlurTuning : {};
  return {
    zoomInDurationMs: number(input.zoomInDurationMs, d.zoomInDurationMs, 60, 4000),
    zoomOutDurationMs: number(input.zoomOutDurationMs, d.zoomOutDurationMs, 60, 4000),
    zoomSmoothness: number(input.zoomSmoothness, d.zoomSmoothness, 0, 1),
    zoomClassicMode: boolean(input.zoomClassicMode, d.zoomClassicMode),
    connectZooms: boolean(input.connectZooms, d.connectZooms),
    connectedZoomGapMs: number(input.connectedZoomGapMs, d.connectedZoomGapMs, 0, 5000),
    connectedZoomDurationMs: number(input.connectedZoomDurationMs, d.connectedZoomDurationMs, 60, 4000),
    cameraSpringStiffnessMultiplier: number(
      input.cameraSpringStiffnessMultiplier,
      d.cameraSpringStiffnessMultiplier,
      0.25,
      3,
    ),
    cameraSpringDampingMultiplier: number(
      input.cameraSpringDampingMultiplier,
      d.cameraSpringDampingMultiplier,
      0.25,
      3,
    ),
    cameraSpringMassMultiplier: number(input.cameraSpringMassMultiplier, d.cameraSpringMassMultiplier, 0.25, 3),
    defaultDurationMs: number(input.defaultDurationMs, d.defaultDurationMs, 1, Number.MAX_SAFE_INTEGER),
    zoomMotionBlur: number(input.zoomMotionBlur, d.zoomMotionBlur, 0, 2),
    loopCursor: boolean(input.loopCursor, d.loopCursor),
    zoomMotionBlurTuning: {
      panVelocityThreshold: number(tuning.panVelocityThreshold, d.zoomMotionBlurTuning.panVelocityThreshold, 0, 240),
      zoomVelocityThreshold: number(tuning.zoomVelocityThreshold, d.zoomMotionBlurTuning.zoomVelocityThreshold, 0, 0.4),
      maxDirectionalBlurPx: number(tuning.maxDirectionalBlurPx, d.zoomMotionBlurTuning.maxDirectionalBlurPx, 0, 96),
      maxRadialBlurStrength: number(tuning.maxRadialBlurStrength, d.zoomMotionBlurTuning.maxRadialBlurStrength, 0, 1.5),
      panResponsePerSecond: number(tuning.panResponsePerSecond, d.zoomMotionBlurTuning.panResponsePerSecond, 1, 30),
      zoomResponsePerSecond: number(tuning.zoomResponsePerSecond, d.zoomMotionBlurTuning.zoomResponsePerSecond, 1, 30),
      zoomSafeZoneRadiusPx: number(tuning.zoomSafeZoneRadiusPx, d.zoomMotionBlurTuning.zoomSafeZoneRadiusPx, 0, 80),
    },
  };
}
