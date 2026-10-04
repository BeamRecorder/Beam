export type AnimationValue = number | string | boolean | readonly number[];
export type AnimationEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | { bezier: readonly [number, number, number, number] }
  | { steps: number; position: 'start' | 'end' }
  | { spring: { damping: number; frequency: number } };
export interface PropertyKeyframe {
  timeMs: number;
  value: AnimationValue;
  easing?: AnimationEasing;
}
export interface PropertyTrack {
  id: string;
  targetId: string;
  property: string;
  interpolation: 'number' | 'color' | 'vector' | 'discrete';
  timeSpace?: 'timeline' | 'local';
  /** Preserves the original animation phase when a clip is split. */
  timeOffsetMs?: number;
  keyframes: PropertyKeyframe[];
}
export interface CompositionAnimations {
  version: 1;
  tracks: PropertyTrack[];
}
export interface SceneClipFragment {
  sourceId: string;
  localOffsetMs: number;
}
export interface SceneTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}
export interface SceneMask {
  shape: 'rectangle' | 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SceneGroup {
  id: string;
  children: string[];
  transform: SceneTransform;
  opacity: number;
  blendMode: 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'difference';
  mask?: SceneMask;
  /** All clips in a group use the same paint space. Captions use overlay; other visuals use scene. */
  space: 'scene' | 'overlay';
  properties?: Record<string, AnimationValue>;
  /** Offset added to children in the parent clock; child time is multiplied by rate. */
  timing?: { startMs: number; rate: number };
}
export interface SceneGraph {
  version: 1;
  roots: string[];
  groups: SceneGroup[];
}
export interface AnimationInterpolator {
  accepts(value: unknown): value is AnimationValue;
  interpolate(from: AnimationValue, to: AnimationValue, progress: number): AnimationValue;
}
export interface SceneClock {
  offsetMs: number;
  rate: number;
}
