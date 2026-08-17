export interface ZoomFocus {
  cx: number;
  cy: number;
}

export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;
export type ZoomMode = 'auto' | 'manual';

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
}

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
}

export interface ZoomMotionBlurSettings {
  enabled: boolean;
  intensity: number;
}

export const DEFAULT_ZOOM_MOTION_BLUR: ZoomMotionBlurSettings = { enabled: true, intensity: 0.55 };

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
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 2;
export const DEFAULT_ZOOM_DURATION_MS = 1_200;
