export interface ZoomFocus {
  cx: number;
  cy: number;
}

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;
export type ZoomMode = 'auto' | 'manual';
export type ZoomProjection = '2d' | '3d';
export type ZoomTiltPreset = 'small' | 'medium' | 'large' | 'custom';

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5,
};

export interface ZoomElement {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  focus: ZoomFocus;
  depth: ZoomDepth;
  mode: ZoomMode;
  /** Missing only in projects saved before perspective zooms were introduced. */
  projection?: ZoomProjection;
  /** Normalized perspective strength. Missing values use the product default. */
  tiltIntensity?: number;
  /** Signed left/right and up/down perspective axes, normalized from -1 to 1. */
  tiltHorizontal?: number;
  tiltVertical?: number;
  tiltPreset?: ZoomTiltPreset;
}

export interface AppliedZoom {
  scale: number;
  focus: ZoomFocus;
  strength: number;
  mode: ZoomElement['mode'];
  /** True only while an automatic region should follow cursor telemetry. */
  tracksCursor?: boolean;
  tilt: number;
  tiltHorizontal?: number;
  tiltVertical?: number;
}

export type ZoomFocusMapper = (focus: ZoomFocus, zoom: AppliedZoom, timeMs: number) => ZoomFocus;

export interface ZoomGenerationRecord {
  sessionId: string;
  algorithmVersion: number;
  generatedAt: string;
}

export interface ProjectZoomState {
  elements: ZoomElement[];
  generatedSessions: ZoomGenerationRecord[];
  /** Missing only in projects saved before zoom motion blur was introduced. */
  motionBlur?: ZoomMotionBlurSettings;
  /** Missing only in projects saved before automatic camera follow controls were introduced. */
  autoFollow?: ZoomAutoFollowSettings;
}

export interface ZoomMotionBlurSettings {
  enabled: boolean;
  intensity: number;
}

export interface ZoomAutoFollowSettings {
  /** Fraction of the visible viewport kept stable around the camera focus. */
  safeZone: number;
  /** Normalized critical-spring response from stable (0) to responsive (1). */
  responsiveness: number;
  /** Holds each target until settled so camera travel stays on a straight segment. */
  directionLock: boolean;
}

export type ZoomAutoFollowPreset = 'stable' | 'balanced' | 'responsive';

export const ZOOM_AUTO_FOLLOW_PRESETS: Record<ZoomAutoFollowPreset, ZoomAutoFollowSettings> = {
  stable: { safeZone: 0.65, responsiveness: 0.3, directionLock: true },
  balanced: { safeZone: 0.5, responsiveness: 0.55, directionLock: true },
  responsive: { safeZone: 0.35, responsiveness: 0.85, directionLock: true },
};

export const DEFAULT_ZOOM_AUTO_FOLLOW: ZoomAutoFollowSettings = { ...ZOOM_AUTO_FOLLOW_PRESETS.balanced };
export const ZOOM_AUTO_FOLLOW_SAFE_ZONE_MIN = 0.25;
export const ZOOM_AUTO_FOLLOW_SAFE_ZONE_MAX = 0.75;

export const normalizeZoomAutoFollow = (
  value: Partial<ZoomAutoFollowSettings> | null | undefined,
): ZoomAutoFollowSettings => ({
  safeZone:
    typeof value?.safeZone === 'number' && Number.isFinite(value.safeZone)
      ? Math.min(ZOOM_AUTO_FOLLOW_SAFE_ZONE_MAX, Math.max(ZOOM_AUTO_FOLLOW_SAFE_ZONE_MIN, value.safeZone))
      : DEFAULT_ZOOM_AUTO_FOLLOW.safeZone,
  responsiveness:
    typeof value?.responsiveness === 'number' && Number.isFinite(value.responsiveness)
      ? Math.min(1, Math.max(0, value.responsiveness))
      : DEFAULT_ZOOM_AUTO_FOLLOW.responsiveness,
  directionLock: value?.directionLock !== false,
});

export const DEFAULT_ZOOM_MOTION_BLUR: ZoomMotionBlurSettings = { enabled: true, intensity: 0.55 };
export const DEFAULT_ZOOM_PROJECTION: ZoomProjection = '2d';
export const DEFAULT_ZOOM_TILT_INTENSITY = 0.6;
export const DEFAULT_ZOOM_TILT_HORIZONTAL = 0.65;
export const DEFAULT_ZOOM_TILT_VERTICAL = -0.35;
export const DEFAULT_ZOOM_TILT_PRESET: ZoomTiltPreset = 'medium';
export const ZOOM_TILT_PRESET_INTENSITIES = { small: 0.3, medium: 0.6, large: 1 } as const;

export const normalizeZoomProjection = (value: unknown): ZoomProjection => (value === '3d' ? '3d' : '2d');
export const normalizeZoomTiltIntensity = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_ZOOM_TILT_INTENSITY;
export const normalizeZoomTiltAxis = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : fallback;
export const normalizeZoomTiltPreset = (value: unknown, intensity: unknown): ZoomTiltPreset => {
  if (value === 'small' || value === 'medium' || value === 'large' || value === 'custom') return value;
  const normalizedIntensity = normalizeZoomTiltIntensity(intensity);
  const matched = Object.entries(ZOOM_TILT_PRESET_INTENSITIES).find(
    ([, presetIntensity]) => Math.abs(presetIntensity - normalizedIntensity) < 1e-6,
  );
  return (matched?.[0] as ZoomTiltPreset | undefined) ?? 'custom';
};

export const normalizeZoomMotionBlur = (
  value: Partial<ZoomMotionBlurSettings> | null | undefined,
): ZoomMotionBlurSettings => ({
  enabled: value?.enabled !== false,
  intensity: Number.isFinite(value?.intensity)
    ? Math.min(1, Math.max(0, Number(value!.intensity)))
    : DEFAULT_ZOOM_MOTION_BLUR.intensity,
});

export const EMPTY_PROJECT_ZOOM_STATE: ProjectZoomState = {
  elements: [],
  generatedSessions: [],
  motionBlur: { ...DEFAULT_ZOOM_MOTION_BLUR },
  autoFollow: { ...DEFAULT_ZOOM_AUTO_FOLLOW },
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 2;
export const DEFAULT_ZOOM_DURATION_MS = 1_200;
