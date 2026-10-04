import { gsap } from "gsap";
import { cursorClickSpringScale } from "../../../packages/engine/src/cursor/cursor-click-spring";
import { cursorRippleAt } from "../../../packages/engine/src/cursor/cursor-ripple";
import type { CursorPoint, DemoClick, DemoMode, Pose } from "./demo-types";

export const DURATION_MS = 8000;
export const CLICKS: Record<DemoMode, DemoClick[]> = {
  captions: [
    { at: 0.75, x: 498, y: 319, target: "generate" },
    { at: 2.1, x: 551, y: 104, target: "style" },
    { at: 3.05, x: 590, y: 249, target: "highlight" },
    { at: 4.05, x: 472, y: 211, target: "font-size" },
    { at: 5.1, x: 590, y: 283, target: "background" },
    { at: 6.2, x: 496, y: 356, target: "transcript" },
  ],
  audio: [
    { at: 0.75, x: 263, y: 240, target: "record" },
    { at: 2.4, x: 228, y: 240, target: "stop" },
    { at: 3.1, x: 242, y: 365, target: "voiceover" },
    { at: 3.95, x: 498.5, y: 125, target: "volume" },
    { at: 5.15, x: 590, y: 169, target: "normalize" },
  ],
};
const PATHS: Record<DemoMode, CursorPoint[]> = {
  captions: [
    { at: 0, x: 330, y: 241 },
    { at: 0.65, x: 498, y: 319 },
    { at: 1.3, x: 498, y: 319 },
    { at: 1.95, x: 551, y: 104 },
    { at: 2.25, x: 551, y: 104 },
    { at: 2.95, x: 590, y: 249 },
    { at: 3.3, x: 590, y: 249 },
    { at: 3.95, x: 472, y: 211 },
    { at: 4.05, x: 472, y: 211 },
    { at: 4.45, x: 493.2, y: 211 },
    { at: 4.95, x: 590, y: 283 },
    { at: 5.4, x: 590, y: 283 },
    { at: 6.1, x: 496, y: 356 },
    { at: 6.5, x: 496, y: 356 },
    { at: 7.15, x: 330, y: 241 },
  ],
  audio: [
    { at: 0, x: 330, y: 241 },
    { at: 0.65, x: 263, y: 240 },
    { at: 1.3, x: 263, y: 240 },
    { at: 2.25, x: 228, y: 240 },
    { at: 2.6, x: 228, y: 240 },
    { at: 2.95, x: 242, y: 365 },
    { at: 3.3, x: 242, y: 365 },
    { at: 3.85, x: 498.5, y: 125 },
    { at: 3.95, x: 498.5, y: 125 },
    { at: 4.45, x: 474.85, y: 125 },
    { at: 4.95, x: 590, y: 169 },
    { at: 5.55, x: 590, y: 169 },
    { at: 6.15, x: 215, y: 349 },
    { at: 7.15, x: 330, y: 241 },
  ],
};
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
  return time >= 7.6 ? 0 : time;
}
export function contentOpacity(time: number) {
  if (time < 7.2) return 1;
  if (time < 7.6) return 1 - smooth((time - 7.2) / 0.35);
  return smooth((time - 7.65) / 0.35);
}
export function createMotion(pose: Pose) {
  return gsap
    .timeline({ paused: true })
    .to(pose, { time: 8, duration: 8, ease: "none" });
}
export function pointerAt(mode: DemoMode, time: number) {
  const t = phaseTime(time),
    points = PATHS[mode];
  const index = Math.max(
    0,
    points.findLastIndex((point) => point.at <= t),
  );
  const left = points[index]!,
    right = points[index + 1] ?? left;
  const mix = smooth((t - left.at) / Math.max(0.001, right.at - left.at));
  const click = CLICKS[mode].findLast((click) => click.at <= t);
  return {
    x: left.x + (right.x - left.x) * mix,
    y: left.y + (right.y - left.y) * mix,
    scale: cursorClickSpringScale(click ? t - click.at : -1, true, 50),
  };
}
export function rippleFor(time: number, click: DemoClick) {
  return cursorRippleAt(phaseTime(time) - click.at, 17, "single");
}
export function captionState(time: number) {
  const t = phaseTime(time);
  return {
    generated: t >= 1.55,
    progress: smooth((t - 0.75) / 0.8) * 100,
    styling: t >= 2.1,
    highlight: t >= 3.05,
    fontSize: 104 + 24 * smooth((t - 4.05) / 0.4),
    background: t >= 5.1,
    transcript: t >= 6.2,
    playheadMs: t < 1.55 ? 0 : Math.min(7900, (t - 1.55) * 1500),
  };
}
export function audioState(time: number) {
  const t = phaseTime(time);
  return {
    phase: t >= 0.75 && t < 2.4 ? ("recording" as const) : ("idle" as const),
    recorded: t >= 2.4,
    selected: t >= 3.1,
    volume: 100 - 22 * smooth((t - 3.95) / 0.5),
    normalizing: t >= 5.15 && t < 5.7,
    normalized: t >= 5.7,
    recordProgress: smooth((t - 0.75) / 1.65),
    playheadMs: t >= 0.75 ? Math.min(7700, (t - 0.75) * 1400) : 0,
  };
}
