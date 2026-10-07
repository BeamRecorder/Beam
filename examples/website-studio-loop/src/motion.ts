import { gsap } from "gsap";
import { cursorClickSpringScale } from "../../../packages/engine/src/cursor/cursor-click-spring";
import type { InspectorMode, PointerStop, Pose, Stage } from "./demo-types";
export const DURATION_MS = 12000;
export const CLICKS = [
  1.05, 2.05, 2.45, 2.85, 3.25, 4.05, 5.35, 5.9, 6.8, 7.6, 8.0, 8.35, 9.15,
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
  return t >= 11.65 ? 0 : t;
}
export function stageAt(time: number): Stage {
  const t = phaseTime(time);
  return t < 1.7
    ? "initial"
    : t < 2.05
      ? "trimmed"
      : t < 2.45
        ? "split"
        : t < 2.85
          ? "split-again"
          : t < 3.25
            ? "deleted"
            : "cut";
}
export function modeAt(time: number): InspectorMode {
  const t = phaseTime(time);
  return t < 4.05
    ? "clip"
    : t < 5.35
      ? "caption"
      : t < 6.55
        ? "shadow"
        : t < 7.6
          ? "size"
          : t < 9.15
            ? "canvas"
            : "clip";
}
export function progress(time: number, start: number, end: number) {
  return smooth((phaseTime(time) - start) / (end - start));
}
export function previewTimeAt(time: number) {
  const t = phaseTime(time);
  return t < 1.7
    ? 0.65
    : t < 2.05
      ? 3.6
      : t < 2.45
        ? 4.4
        : t < 2.85
          ? 4
          : t < 3.25
            ? 3.4
            : t < 9.15
              ? 4.4
              : 4.4 + (t - 9.15);
}
export function opacityAt(time: number) {
  const t = clampTime(time * 1000);
  return t < 11.3
    ? 1
    : t < 11.65
      ? 1 - smooth((t - 11.3) / 0.3)
      : smooth((t - 11.65) / 0.35);
}
// Every move stops briefly at a real control. Drags stay captured in native timeline coordinates.
const stops: PointerStop[] = [
  { at: 0, x: 930, y: 380 },
  { at: 0.65, x: 1225, y: 724 },
  { at: 1.05, x: 1225, y: 724 },
  { at: 1.7, x: 1153, y: 724 },
  { at: 1.8, x: 471, y: 631 },
  { at: 1.95, x: 59, y: 596 },
  { at: 2.18, x: 59, y: 596 },
  { at: 2.25, x: 543, y: 631 },
  { at: 2.4, x: 59, y: 596 },
  { at: 2.62, x: 59, y: 596 },
  { at: 2.72, x: 507, y: 724 },
  { at: 2.97, x: 507, y: 724 },
  { at: 3.14, x: 507, y: 724 },
  { at: 3.45, x: 507, y: 724 },
  { at: 3.85, x: 465, y: 85 },
  { at: 4.12, x: 465, y: 85 },
  { at: 4.35, x: 173, y: 196 },
  { at: 5.1, x: 173, y: 196 },
  { at: 5.28, x: 650, y: 310 },
  { at: 5.35, x: 650, y: 310 },
  { at: 5.5, x: 170, y: 158 },
  { at: 5.8, x: 171, y: 402 },
  { at: 6.2, x: 171, y: 402 },
  { at: 6.5, x: 171, y: 118 },
  { at: 6.78, x: 175, y: 350 },
  { at: 7.28, x: 175, y: 350 },
  { at: 7.48, x: 361, y: 80 },
  { at: 7.74, x: 361, y: 80 },
  { at: 7.9, x: 279, y: 194 },
  { at: 8.13, x: 279, y: 194 },
  { at: 8.3, x: 271, y: 263 },
  { at: 8.65, x: 271, y: 263 },
  { at: 8.95, x: 595, y: 596 },
  { at: 9.28, x: 595, y: 596 },
  { at: 9.9, x: 930, y: 380 },
  { at: 11.65, x: 930, y: 380 },
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
  const mix = left.at === 1.05 ? p : smooth(p),
    click = CLICKS.findLast((at) => at <= t);
  return {
    x: left.x + (right.x - left.x) * mix,
    y: left.y + (right.y - left.y) * mix,
    scale: cursorClickSpringScale(
      click === undefined ? -1 : t - click,
      true,
      40,
    ),
    role: t >= 0.8 && t < 1.75 ? "resizewesteast" : "default",
  };
}
const cameras = [
  { at: 0, s: 1, x: 640, y: 400 },
  { at: 0.55, s: 1, x: 640, y: 400 },
  { at: 1, s: 1.55, x: 890, y: 638 },
  { at: 1.7, s: 1.55, x: 890, y: 638 },
  { at: 1.93, s: 1.6, x: 430, y: 644 },
  { at: 3.5, s: 1.6, x: 430, y: 644 },
  { at: 3.9, s: 1, x: 640, y: 400 },
  { at: 4.5, s: 1.4, x: 410, y: 295 },
  { at: 5.1, s: 1.4, x: 410, y: 295 },
  { at: 5.6, s: 1.5, x: 410, y: 350 },
  { at: 6.2, s: 1.5, x: 410, y: 350 },
  { at: 6.75, s: 1.5, x: 410, y: 300 },
  { at: 7.2, s: 1.5, x: 410, y: 300 },
  { at: 7.7, s: 1.4, x: 410, y: 285 },
  { at: 8.65, s: 1.4, x: 410, y: 285 },
  { at: 9.1, s: 1, x: 640, y: 400 },
  { at: 9.8, s: 1.12, x: 750, y: 340 },
  { at: 10.9, s: 1.12, x: 750, y: 340 },
  { at: 11.25, s: 1, x: 640, y: 400 },
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
    .to(pose, { time: 12, duration: 12, ease: "none" }, 0);
}
