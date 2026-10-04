import { gsap } from "gsap";
import { cursorClickSpringScale } from "../../../packages/engine/src/cursor/cursor-click-spring";
import { cursorRippleAt } from "../../../packages/engine/src/cursor/cursor-ripple";
import type { TransitionPreset } from "@beam/engine/shared/composition-types";
import type { CursorPoint, DemoClick, DemoMode, Pose } from "./demo-types";

export const DURATION_MS = 8000;
export const CLICKS: Record<DemoMode, DemoClick[]> = {
  transitions: [
    { at: 0.75, x: 588, y: 247, target: "slide" },
    { at: 1.7, x: 413, y: 172, target: "duration" },
    { at: 2.8, x: 418, y: 345, target: "zoom" },
    { at: 4, x: 588, y: 345, target: "blur" },
    { at: 5.1, x: 552, y: 91, target: "canvas" },
    { at: 5.65, x: 418, y: 345, target: "zoom" },
    { at: 6.2, x: 70, y: 257, target: "text" },
  ],
  export: [
    { at: 0.7, x: 567, y: 31, target: "open-export" },
    { at: 1.45, x: 443, y: 148, target: "webm" },
    { at: 2, x: 553, y: 148, target: "mp4" },
    { at: 2.7, x: 577, y: 198, target: "resolution" },
    { at: 3.4, x: 577, y: 247, target: "fps" },
    { at: 4.1, x: 577, y: 296, target: "quality" },
    { at: 4.8, x: 495, y: 352, target: "export-video" },
  ],
};
export function clampTime(ms: number) {
  return Number.isFinite(ms)
    ? Math.max(0, Math.min(DURATION_MS, ms)) / 1000
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
function pointsFor(mode: DemoMode): CursorPoint[] {
  const points: CursorPoint[] = [{ at: 0, x: 310, y: 201 }];
  for (const click of CLICKS[mode]) {
    points.push(
      { ...click, at: click.at - 0.11 },
      { ...click, at: click.at + (click.target === "duration" ? 0 : 0.16) },
    );
    if (click.target === "duration")
      points.push({ at: click.at + 0.45, x: click.x + 17.4, y: click.y });
  }
  points.push({ at: 7.15, x: 310, y: 201 });
  return points;
}
const PATHS = {
  transitions: pointsFor("transitions"),
  export: pointsFor("export"),
};
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
export function transitionState(time: number) {
  const t = phaseTime(time),
    canvas = t >= 5.1;
  let preset: TransitionPreset = { kind: "fade" },
    selectedAt = -1;
  if (canvas) {
    if (t >= 5.65) {
      preset = { kind: "zoom", direction: "in" };
      selectedAt = 5.65;
    } else selectedAt = 5.1;
  } else if (t >= 4) {
    preset = { kind: "blur" };
    selectedAt = 4;
  } else if (t >= 2.8) {
    preset = { kind: "zoom", direction: "in" };
    selectedAt = 2.8;
  } else if (t >= 0.75) {
    preset = { kind: "slide", direction: "left" };
    selectedAt = 0.75;
  }
  return {
    canvas,
    preset,
    duration: Math.round(500 + 400 * smooth((t - 1.7) / 0.45)),
    previewMs: selectedAt < 0 ? 1000 : Math.max(0, (t - selectedAt) * 1000),
    text: t >= 6.2,
    textProgress: smooth((t - 6.2) / 0.5),
    playheadMs: Math.min(7900, t * 1000),
  };
}
export function exportState(time: number) {
  const t = phaseTime(time);
  return {
    open: t >= 0.7,
    format: t >= 2 ? ("mp4" as const) : ("webm" as const),
    resolution: t >= 2.7 ? ("max" as const) : ("1080p" as const),
    fps: t >= 3.4 ? 60 : 30,
    preset: t >= 4.1 ? ("high" as const) : ("medium" as const),
    running: t >= 4.8 && t < 6.35,
    saved: t >= 6.35,
    progress: smooth((t - 4.8) / 1.55) * 100,
    playheadMs: Math.min(7900, t * 1000),
  };
}
