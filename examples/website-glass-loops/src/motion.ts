import { gsap } from 'gsap';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import { contour } from './scene-model';
import type { DemoKind, Pose } from './demo-types';
export const DURATION_MS = 10000;
export function clampTime(ms: number) {
  return Number.isFinite(ms) ? Math.max(0, Math.min(DURATION_MS, ms)) / 1000 : 0;
}
export function initialPose(): Pose { return { time: 0, x: 880, y: 530, camera: 0 }; }
export function stateAt(time: number, kind: DemoKind) {
  const t = clampTime(time * 1000), reset = t >= 9.5;
  return {
    style: kind === 'automatic' && (t < 1.2 || reset),
    selection: kind === 'glass' && (t < 4.05 || reset),
    appearance: kind === 'glass' && t >= 4.05 && !reset,
    magnification: kind === 'automatic' && t >= 7.4 && !reset,
    automatic: kind === 'automatic' && t >= 1.2 && t < 7.4,
    dialog: kind === 'automatic' && t >= 2.1 && t < 3.35,
    drawProgress: Math.max(0, Math.min(1, (t - 2.25) / 1.2)),
    opacity: t < 9 ? 1 : t < 9.5 ? (9.5 - t) / .5 : (t - 9.5) / .5,
  };
}
export function clickScale(time: number, kind: DemoKind) {
  const clicks = kind === 'glass' ? [1.8, 2.25, 4.05, 5.1, 6.6] : [.65, 1.2, 2.1, 3.35, 7.4, 8.05];
  const click = clicks.findLast((at) => at <= time);
  return cursorClickSpringScale(click === undefined ? -1 : time - click, true, 40);
}
export function createMotion(pose: Pose, kind: DemoKind) {
  const tl = gsap.timeline({ paused: true });
  tl.to(pose, { time: 10, duration: 10, ease: 'none' }, 0);
  const points = kind === 'glass' ? [
    [.8, 905, 210, .7], [3.55, 820, 410, .35], [3.9, 840, 423, .15],
    [4.5, 750, 254, .6], [5.1, 811, 254, .8], [6.05, 777, 340, .55],
    [6.6, 870, 340, .8], [7.9, 653, 441, .6],
  ] : [
    [.15, 935, 163, .5], [.7, 840, 474, .5], [1.4, 840, 473, .7],
    [2.55, 627.4, 408.34, .8], [3.6, 635, 487, .55], [6.7, 270, 581, .7],
    [7.6, 840, 410, .45], [8.35, 680, 433, .6],
  ];
  for (const [at, x, y, duration] of points)
    tl.to(pose, { x, y, duration, ease: at === 5.1 || at === 6.6 ? 'none' : 'power2.inOut' }, at);
  if (kind === 'glass') {
    contour.forEach((point, i) => {
      tl.to(pose, { x: 38 + point.x * 628, y: 82 + point.y * 353.25,
        duration: i === 0 ? .4 : 1.2 / 64, ease: i === 0 ? 'power2.inOut' : 'none' },
      i === 0 ? 1.85 : 2.25 + (i - 1) * 1.2 / 64);
    });
  }
  tl.to(pose, { camera: 1, duration: .7, ease: 'sine.inOut' }, .2);
  tl.to(pose, { camera: 0, x: 880, y: 530, duration: .5, ease: 'sine.inOut' }, 9);
  return tl;
}
