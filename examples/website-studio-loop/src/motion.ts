import { gsap } from "gsap";
import { cursorClickSpringScale } from "../../../packages/engine/src/cursor/cursor-click-spring";
import type { InspectorMode, PointerStop, Pose, Stage } from "./demo-types";
export const DURATION_MS = 15000;
// Seconds on the presentation clock; native project/source timing stays independent.
export const BEATS = {
  trimStart: 1.3,
  trimEnd: 2.2,
  split: 3.05,
  splitAgain: 3.8,
  delete: 4.45,
  closeGap: 5.15,
  caption: 5.95,
  typeStart: 6.45,
  typeEnd: 7.4,
  shadow: 7.95,
  shadowHeading: 8.4,
  shadowColor: 8.9,
  size: 9.45,
  resizeStart: 9.95,
  resizeEnd: 10.55,
  canvas: 10.95,
  gradient: 11.35,
  ocean: 11.75,
  play: 12.5,
  fade: 14.25,
  reset: 14.65,
} as const;
export const CLICKS = [
  BEATS.trimStart,
  BEATS.split,
  BEATS.splitAgain,
  BEATS.delete,
  BEATS.closeGap,
  BEATS.caption,
  BEATS.shadow,
  BEATS.shadowHeading,
  BEATS.shadowColor,
  9.55,
  BEATS.resizeStart,
  BEATS.canvas,
  BEATS.gradient,
  BEATS.ocean,
  BEATS.play,
];
export function clampTime(ms: number) {
  return Number.isFinite(ms)
    ? Math.min(DURATION_MS, Math.max(0, ms)) / 1000
    : 0;
}
export function smooth(value: number) {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
}
export function phaseTime(time: number) {
  const t = clampTime(time * 1000);
  return t >= BEATS.reset ? 0 : t;
}
export function stageAt(time: number): Stage {
  const t = phaseTime(time);
  return t < BEATS.trimEnd
    ? "initial"
    : t < BEATS.split
      ? "trimmed"
      : t < BEATS.splitAgain
        ? "split"
        : t < BEATS.delete
          ? "split-again"
          : t < BEATS.closeGap
            ? "deleted"
            : "cut";
}
export function modeAt(time: number): InspectorMode {
  const t = phaseTime(time);
  return t < BEATS.caption
    ? "clip"
    : t < BEATS.shadow
      ? "caption"
      : t < BEATS.size
        ? "shadow"
        : t < BEATS.canvas
          ? "size"
          : t < BEATS.play
            ? "canvas"
            : "clip";
}
export function progress(time: number, start: number, end: number) {
  return smooth((phaseTime(time) - start) / (end - start));
}
export function previewTimeAt(time: number) {
  const t = phaseTime(time);
  return t < BEATS.trimEnd
    ? 0.65
    : t < BEATS.split
      ? 3.6
      : t < BEATS.splitAgain
        ? 4.4
        : t < BEATS.delete
          ? 4
          : t < BEATS.closeGap
            ? 3.4
            : t < BEATS.play
              ? 4.4
              : 4.4 + (t - BEATS.play);
}
export function opacityAt(time: number) {
  const t = clampTime(time * 1000);
  return t < BEATS.fade
    ? 1
    : t < BEATS.reset
      ? 1 - smooth((t - BEATS.fade) / (BEATS.reset - BEATS.fade))
      : smooth((t - BEATS.reset) / (DURATION_MS / 1000 - BEATS.reset));
}
// Every move stops briefly at a real control. Drags stay captured in native timeline coordinates.
const stops: PointerStop[] = [
  { at: 0, x: 930, y: 380 },
  { at: 0.35, x: 930, y: 380 },
  { at: 1.0, x: 1225, y: 724 },
  { at: BEATS.trimStart, x: 1225, y: 724 },
  { at: BEATS.trimEnd, x: 1153, y: 724 },
  { at: BEATS.split, x: 59, y: 596 },
  { at: 4.0, x: 59, y: 596 },
  { at: 4.4, x: 507, y: 724 },
  { at: 5.35, x: 507, y: 724 },
  { at: 5.9, x: 465, y: 85 },
  { at: 6.1, x: 465, y: 85 },
  { at: BEATS.typeStart, x: 173, y: 196 },
  { at: 7.5, x: 173, y: 196 },
  { at: BEATS.shadow, x: 650, y: 310 },
  { at: BEATS.shadowHeading, x: 170, y: 158 },
  { at: BEATS.shadowColor, x: 171, y: 402 },
  { at: 9.25, x: 171, y: 402 },
  { at: 9.55, x: 171, y: 118 },
  { at: BEATS.resizeStart, x: 175, y: 350 },
  { at: 10.65, x: 175, y: 350 },
  { at: BEATS.canvas, x: 361, y: 80 },
  { at: 11.1, x: 361, y: 80 },
  { at: BEATS.gradient, x: 279, y: 194 },
  { at: 11.5, x: 279, y: 194 },
  { at: BEATS.ocean, x: 271, y: 263 },
  { at: 12.1, x: 271, y: 263 },
  { at: BEATS.play, x: 595, y: 596 },
  { at: 12.7, x: 595, y: 596 },
  { at: 13.4, x: 930, y: 380 },
  { at: BEATS.reset, x: 930, y: 380 },
];
export function pointerAt(time: number) {
  const t = phaseTime(time),
    index = Math.max(
      0,
      stops.findLastIndex((stop) => stop.at <= t),
    );
  const left = stops[index]!,
    right = stops[index + 1] ?? left;
  const p = Math.max(
    0,
    Math.min(1, (t - left.at) / Math.max(0.001, right.at - left.at)),
  );
  const mix = left.at === BEATS.trimStart ? p : smooth(p),
    click = CLICKS.findLast((at) => at <= t);
  return {
    x: left.x + (right.x - left.x) * mix,
    y: left.y + (right.y - left.y) * mix,
    scale: cursorClickSpringScale(
      click === undefined ? -1 : t - click,
      true,
      40,
    ),
    role: t >= 0.85 && t < BEATS.trimEnd + 0.05 ? "resizewesteast" : "default",
  };
}
// Two restrained focus views. Hold the camera throughout each edit instead of chasing controls.
const cameras = [
  { at: 0, s: 1, x: 640, y: 400 },
  { at: BEATS.trimEnd, s: 1, x: 640, y: 400 },
  { at: BEATS.split, s: 1.1, x: 580, y: 470 },
  { at: 5.25, s: 1.1, x: 580, y: 470 },
  { at: 6.2, s: 1.22, x: 520, y: 350 },
  { at: 11.95, s: 1.22, x: 520, y: 350 },
  { at: 12.85, s: 1, x: 640, y: 400 },
];
export function cameraAt(time: number) {
  const t = phaseTime(time),
    index = Math.max(
      0,
      cameras.findLastIndex((stop) => stop.at <= t),
    );
  const a = cameras[index]!,
    b = cameras[index + 1] ?? a;
  const p = smooth((t - a.at) / Math.max(0.001, b.at - a.at));
  const s = a.s + (b.s - a.s) * p,
    x = a.x + (b.x - a.x) * p,
    y = a.y + (b.y - a.y) * p;
  // Align the camera to output pixels so Chromium re-seeks preserve clipped card edges.
  return {
    scale: s,
    x: Math.round((640 - x * s) * 1.25) / 1.25,
    y: Math.round((400 - y * s) * 1.25) / 1.25,
  };
}
export function createMotion(pose: Pose) {
  return gsap
    .timeline({ paused: true })
    .to(
      pose,
      { time: DURATION_MS / 1000, duration: DURATION_MS / 1000, ease: "none" },
      0,
    );
}
