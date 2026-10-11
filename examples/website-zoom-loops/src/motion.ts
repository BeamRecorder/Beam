import { gsap } from 'gsap';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import { cursorRippleAt } from '../../../packages/engine/src/cursor/cursor-ripple';
import type { CursorPoint, DemoClick, DemoMode, Pose } from './demo-types';

export const DURATION_MS = 8000;
export const CLICKS: Record<DemoMode, DemoClick[]> = {
  '2d': [
    { at: 0.8, x: 174.39, y: 349.5, target: 'first-zoom' },
    { at: 3.4, x: 261.09, y: 349.5, target: 'second-zoom' },
  ],
  '3d': [
    { at: 0.8, x: 526.15, y: 243.1, target: 'tilt-left' },
    { at: 3.4, x: 470.85, y: 272.5, target: 'pull-front' },
  ],
};
export function clampTime(ms: number) {
  return Number.isFinite(ms) ? Math.max(0, Math.min(DURATION_MS, ms)) / 1000 : 0;
}
export function smooth(value: number) {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
}
export function phaseTime(time: number) {
  return time >= 7.6 ? 0 : Math.max(0, time);
}
export function contentOpacity(time: number) {
  if (time < 7.2) return 1;
  if (time < 7.6) return 1 - smooth((time - 7.2) / 0.35);
  return smooth((time - 7.65) / 0.35);
}
export function createMotion(pose: Pose) {
  return gsap.timeline({ paused: true }).to(pose, { time: 8, duration: 8, ease: 'none' });
}
function pointsFor(mode: DemoMode): CursorPoint[] {
  return [
    { at: 0, x: 300, y: 206 },
    ...CLICKS[mode].flatMap((click) => [
      { ...click, at: click.at - 0.14 },
      { ...click, at: click.at + 0.22 },
      { at: click.at + 0.85, x: 240, y: 188 },
    ]),
    { at: 6.4, x: 300, y: 206 },
  ];
}
const paths = { '2d': pointsFor('2d'), '3d': pointsFor('3d') };
export function pointerAt(mode: DemoMode, time: number) {
  const t = phaseTime(time),
    points = paths[mode];
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
  return cursorRippleAt(phaseTime(time) - click.at, 17, 'single');
}
