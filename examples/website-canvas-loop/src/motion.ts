import { gsap } from "gsap";
import { cursorClickSpringScale } from "../../../packages/engine/src/cursor/cursor-click-spring";
import { cursorRippleAt } from "../../../packages/engine/src/cursor/cursor-ripple";
import type {
  BackgroundSelection,
  BackgroundStep,
  CanvasPose,
} from "./demo-types";

export const DURATION_MS = 7000;
export const INITIAL_ID = "sonoma-horizon";
export const INITIAL_BACKGROUND: BackgroundSelection = {
  id: INITIAL_ID,
  kind: "image",
  title: "Sonoma Horizon",
  at: 0,
};
export const STEPS: BackgroundStep[] = [
  {
    id: "golden-gate-light",
    kind: "image",
    title: "Golden Gate Light",
    at: 0.62,
    x: 408.6,
    y: 152.8,
    select: true,
  },
  {
    id: "mountaintrees",
    kind: "image",
    title: "Mountain Trees",
    at: 1.52,
    x: 465,
    y: 152.8,
    select: true,
  },
  {
    id: "video-tab",
    kind: "video",
    title: "Video",
    at: 2.25,
    x: 430.5,
    y: 107,
  },
  {
    id: "wispysky",
    kind: "video",
    title: "Wispy Sky",
    at: 2.7,
    x: 408.6,
    y: 152.8,
    select: true,
  },
  {
    id: "color-tab",
    kind: "color",
    title: "Color",
    at: 3.95,
    x: 499.5,
    y: 107,
  },
  {
    id: "color:#1d4ed8",
    kind: "color",
    title: "#1D4ED8",
    at: 4.36,
    x: 577.8,
    y: 152.8,
    select: true,
  },
  {
    id: "gradient-tab",
    kind: "gradient",
    title: "Gradient",
    at: 5.08,
    x: 568.5,
    y: 107,
  },
  {
    id: "gradient:sunset",
    kind: "gradient",
    title: "Sunset",
    at: 5.49,
    x: 577.8,
    y: 152.8,
    select: true,
  },
];
export const initialPose = (): CanvasPose => ({
  time: 0,
  x: 565,
  y: 350,
  camera: 0,
});
export function clampTime(timeMs: number) {
  return Number.isFinite(timeMs)
    ? Math.max(0, Math.min(DURATION_MS, timeMs)) / 1000
    : 0;
}
export function createMotion(pose: CanvasPose) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(pose, { time: 7, duration: 7, ease: "none" }, 0);
  let previous = 0;
  for (const step of STEPS) {
    const duration = Math.min(0.46, step.at - previous - 0.14);
    timeline.to(
      pose,
      { x: step.x, y: step.y, duration, ease: "power2.inOut" },
      step.at - duration - 0.045,
    );
    previous = step.at;
  }
  timeline.to(pose, { camera: 1, duration: 0.6, ease: "sine.inOut" }, 0.25);
  timeline.to(
    pose,
    { x: 565, y: 350, duration: 0.55, ease: "power2.inOut" },
    5.98,
  );
  timeline.to(pose, { camera: 0, duration: 0.65, ease: "sine.inOut" }, 6.15);
  return timeline;
}
export function stateAt(time: number) {
  const selections = STEPS.filter((step) => step.select && step.at <= time);
  const current = selections.at(-1) ?? INITIAL_BACKGROUND;
  const previous = selections.at(-2) ?? INITIAL_BACKGROUND;
  const tab = STEPS.filter((step) => step.at <= time).at(-1)?.kind ?? "image";
  const transition = Math.min(1, Math.max(0, (time - current.at) / 0.28));
  const restore = Math.min(1, Math.max(0, (time - 6.25) / 0.55));
  return {
    current,
    previous,
    tab: restore >= 0.5 ? ("image" as const) : tab,
    transition,
    restore,
  };
}
export function clickAt(time: number) {
  const click = STEPS.filter((step) => step.at <= time).at(-1);
  return {
    click,
    scale: cursorClickSpringScale(click ? time - click.at : -1, true, 40),
  };
}
export function rippleAt(time: number, click: BackgroundStep) {
  return cursorRippleAt(time - click.at, 13, "double");
}
