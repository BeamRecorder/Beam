import { gsap } from "gsap";
import { createDefaultCursorMotionSettings } from "../../../packages/engine/src/capture/cursor-settings";
import { cursorClickSpringScale } from "../../../packages/engine/src/cursor/cursor-click-spring";
import { cursorRippleAt } from "../../../packages/engine/src/cursor/cursor-ripple";
import type { CursorPose, DemoClick, ShowcaseStep } from "./demo-types";

export const DURATION_MS = 12000;
export const MOTION = createDefaultCursorMotionSettings();
export const STEPS: ShowcaseStep[] = [
  { at: 0, role: "default", label: "Point", action: "button" },
  { at: 0.65, role: "handpointing", label: "Click", action: "button" },
  { at: 1.75, role: "textcursor", label: "Write", action: "text" },
  { at: 2.8, role: "move", label: "Move", action: "move" },
  { at: 3.8, role: "resizewesteast", label: "Resize", action: "resize" },
  { at: 4.8, role: "cross", label: "Select", action: "select" },
  { at: 5.55, role: "default", label: "Point", action: "button" },
  { at: 6.5, role: "handpointing", label: "Click", action: "button" },
  { at: 7.5, role: "textcursor", label: "Write", action: "text" },
  {
    at: 8.5,
    role: "resizenorthwestsoutheast",
    label: "Resize",
    action: "resize",
  },
  { at: 9.45, role: "notallowed", label: "Unavailable", action: "disabled" },
  { at: 10.15, role: "help", label: "Help", action: "help" },
  { at: 10.75, role: "default", label: "Point", action: "button" },
];
export const CLICKS: DemoClick[] = [
  { at: 0.95, x: 264, y: 115, target: "action" },
  { at: 5.8, x: 582, y: 126, target: "pack" },
  { at: 6.75, x: 264, y: 115, target: "action" },
  { at: 10.95, x: 582, y: 126, target: "pack" },
];
export const initialPose = (): CursorPose => ({ time: 0 });
export function clampTime(ms: number) {
  return Number.isFinite(ms)
    ? Math.max(0, Math.min(DURATION_MS, ms)) / 1000
    : 0;
}
export function createMotion(pose: CursorPose) {
  return gsap
    .timeline({ paused: true })
    .to(pose, { time: 12, duration: 12, ease: "none" });
}
export const smooth = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};
export function stepAt(time: number) {
  return STEPS.filter((step) => step.at <= time).at(-1) ?? STEPS[0];
}
export function settingsAt(time: number) {
  const mix = smooth((time - 5.8) / 0.28) * (1 - smooth((time - 10.95) / 0.28));
  return {
    packId:
      time >= 5.8 && time < 10.95
        ? "builtin:bibata-material-noir"
        : "builtin:macos",
    mix,
    size:
      36 +
      12 * smooth((time - 6.05) / 0.45) * (1 - smooth((time - 10.95) / 0.28)),
    rippleStyle:
      time >= 5.8 && time < 10.95 ? ("double" as const) : ("single" as const),
  };
}
export function actionAt(time: number) {
  const step = stepAt(time);
  const p = smooth((time - step.at) / 0.7);
  return {
    step,
    progress: p,
    width: step.action === "resize" ? 148 + 48 * p : 164,
    x: step.action === "move" ? 24 * Math.sin(p * Math.PI) : 0,
    y: step.action === "move" ? -8 * Math.sin(p * Math.PI) : 0,
    text: "Make it yours.".slice(0, Math.round(p * 14)),
  };
}
export function clickScaleAt(time: number) {
  const click = CLICKS.filter((c) => c.at <= time).at(-1);
  return cursorClickSpringScale(click ? time - click.at : -1, true, 50);
}
export function rippleFor(time: number, click: DemoClick) {
  return cursorRippleAt(time - click.at, 18, settingsAt(click.at).rippleStyle);
}
