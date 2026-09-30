import type { PROFILES } from './profiles';
export interface DotRender {
  x: number;
  y: number;
  r: number;
  opacity: number;

  color?: string;

  depth?: number;

  d?: string;

  rot?: number;
}
export interface ArcSpec {
  id: string;
  seed: ArcSeed;
  t: number;
  opacity: number;
}
export interface ArcRender {
  id: string;

  front: string;

  back: string;
  width: number;
  opacity: number;

  grad: { x1: number; y1: number; x2: number; y2: number; stops: string[] };
}
export interface ArcSeed {
  a: number;

  k: number;

  tilt: number;

  speed: number;
  phase: number;

  sweep: number;
  hue: number;
  hueSpan: number;
  width: number;
  cx: number;
  cy: number;
}
export interface RenderedEye {
  d: string;
  matrix: string;
  alpha: number;
}
export interface BotFrame {
  bodyPath: string;
  bodyAlpha: number;
  eyes: RenderedEye[];
  dots: DotRender[];

  dotsBehind: boolean;
  arcs: ArcRender[];
  notif: { x: number; y: number; r: number } | null;
  notch: { x: number; y: number; r: number } | null;
}
export interface Look {
  yaw: number;
  pitch: number;
  mix: number;
  spin: number;
  wander: number;
}
export type ExpressionId =
  | 'neutre'
  | 'attentif'
  | 'surpris'
  | 'excite'
  | 'heureux'
  | 'hilare'
  | 'colere'
  | 'triste'
  | 'effraye'
  | 'mefiant'
  | 'confus'
  | 'curieux'
  | 'fier'
  | 'timide'
  | 'blase'
  | 'somnolent';
export interface BotExpression {
  id: ExpressionId;
  gaze: HeadGaze;
  split: number;
  eyes: [EyeCfg, EyeCfg];
}
export interface Visage {
  gaze: Pose['gaze'];
  split: number;
  eyes: Pose['eyes'];
}
export interface Empreinte {
  x: number;
  y: number;

  ax: number;
  ay: number;

  r: number;

  m: [number, number, number, number];
}
export interface Epreuve {
  empreintes: Empreinte[];
  reference: Empreinte[];
  contour: Point[];
  calContour: Point[];
}
export type Vec3 = [number, number, number];
export interface EyePose {
  x: number;
  y: number;

  a: number;
  b: number;
  c: number;
  d: number;

  depth: number;
}
export interface HeadGaze {
  yaw: number;

  pitch: number;

  roll: number;
}
export interface Liveliness {
  dYaw: number;
  dPitch: number;
  dRoll: number;

  lid: number;
  driftX: number;
  driftY: number;
  breath: number;
}
export interface LivelinessOptions {
  wander?: number;
  blink?: boolean;
  float?: boolean;
}
export type Easing = (t: number) => number;
export type ProfileName = keyof typeof PROFILES;
export interface Point {
  x: number;
  y: number;
}
export interface Silhouette {
  radii: number[];

  rot: number;

  cx: number;
  cy: number;

  sx: number;
  sy: number;
}
export type ShapeId = 'cercle' | 'galet' | 'squircle' | 'capsule' | 'triangle' | 'hexagone' | 'nuage' | 'goutte';
export interface BotShape {
  id: ShapeId;
  radii: number[];
}
export type ColorId =
  | 'encre'
  | 'creme'
  | 'brun'
  | 'rouge'
  | 'orange'
  | 'ambre'
  | 'vert'
  | 'turquoise'
  | 'bleu'
  | 'violet'
  | 'rose'
  | 'gris';
export interface BotColor {
  id: ColorId;
  hex: string;
}
export interface EyeCfg {
  w: number;

  h: number;

  open: number;

  tilt?: number;
}
export interface Pose {
  sil: Silhouette;

  offX: number;
  offY: number;
  gaze: HeadGaze;

  split: number;

  eyes: [EyeCfg, EyeCfg];

  eyeAlpha: number;
  bodyAlpha: number;
  dots: DotRender[];
  arcs: ArcSpec[];
  notif: { x: number; y: number; r: number; notch: number } | null;

  dotsBehind: boolean;
}
export type StateId =
  | 'idle'
  | 'thinking'
  | 'wink'
  | 'wide'
  | 'alert'
  | 'notify'
  | 'exclaim'
  | 'sleep'
  | 'egg'
  | 'hexagon'
  | 'play'
  | 'orbit'
  | 'burst'
  | 'comet'
  | 'swirl';
export interface StateDef {
  id: StateId;

  duration: number;

  minDuration?: number;

  morph: number;

  blinkIn: boolean;

  baseBody: boolean;

  baseFace: boolean;
  pose(local: number): Pose;
}
