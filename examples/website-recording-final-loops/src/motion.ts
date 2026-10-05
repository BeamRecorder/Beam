import { gsap } from 'gsap';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import type { DemoKind, DemoPose } from './demo-types';
export const DURATION_MS = 8000;
export function clampTime(ms: number) {
  return Number.isFinite(ms) ? Math.max(0, Math.min(DURATION_MS, ms)) / 1000 : 0;
}
export function initialPose(): DemoPose {
  return { time: 0, x: 1060, y: 580, camera: 0 };
}
export function stateAt(time: number) {
  const t = clampTime(time * 1000);
  const reset = t >= 7.5;
  const reading = t >= 0.85 && !reset;
  const drag = Math.max(0, Math.min(1, (t - 3.15) / 0.75));
  return {
    reading,
    speedOpen: t >= 2.15 && t < 4.65,
    speed: reset ? 42 : Math.round(42 + drag * 32),
    scroll: reading ? Math.max(0, (Math.min(t, 3.15) - 0.85) * 42) + Math.max(0, t - 3.15) * 74 : 0,
    selected: t >= 1.1 && !reset,
    menuOpen: t >= 2.2 && t < 3.3,
    folder: reset ? 0 : Math.max(0, Math.min(1, (t - 3.3) / 0.5)),
    sourceSelected: t >= 5.05 && !reset,
    opacity: t <= 7 ? 1 : t < 7.5 ? (7.5 - t) / 0.5 : (t - 7.5) / 0.5,
  };
}
export function clickScale(time: number, kind: DemoKind) {
  const clicks = kind === 'teleprompter' ? [0.85, 2.15, 3.15, 4.65] : [1.1, 2.2, 3.3, 5.05];
  const click = clicks.findLast((at) => at <= time);
  return cursorClickSpringScale(click === undefined ? -1 : time - click, true, 40);
}
export function createMotion(pose: DemoPose, kind: DemoKind) {
  const tl = gsap.timeline({ paused: true });
  tl.to(pose, { time: 8, duration: 8, ease: 'none' }, 0);
  const points =
    kind === 'teleprompter'
      ? [
          [0.25, 781, 624, 0.5],
          [1.45, 477, 624, 0.6],
          [2.6, 420, 580, 0.5],
          [3.15, 440, 580, 0.75],
          [4.05, 477, 624, 0.5],
          [5.0, 1000, 550, 0.6],
        ]
      : [
          [0.45, 304, 270, 0.5],
          [1.5, 458, 395, 0.6],
          [2.65, 418, 481, 0.5],
          [4.35, 683, 542, 0.65],
          [5.5, 1015, 585, 0.6],
        ];
  for (const [at, x, y, duration] of points) tl.to(pose, { x, y, duration, ease: 'power2.inOut' }, at);
  tl.to(pose, { camera: 1, duration: 0.8, ease: 'sine.inOut' }, 0.2);
  tl.to(pose, { camera: 0, x: 1060, y: 580, duration: 0.5, ease: 'sine.inOut' }, 7);
  return tl;
}
