import { gsap } from 'gsap';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import type { DemoStyle, PointerStop, Pose } from './demo-types';
export const DURATION_MS = 9000;
export const CLICKS = [.55, 2.65, 3.25, 5.1, 6.1, 7.2];
export function clampTime(ms: number) {
  return Number.isFinite(ms) ? Math.min(DURATION_MS, Math.max(0, ms)) / 1000 : 0;
}
export function smooth(value: number) {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
}
export function phaseTime(time: number) {
  const t = clampTime(time * 1000);
  return t >= 8.65 ? 0 : t;
}
export function styleAt(time: number): DemoStyle {
  const t = phaseTime(time);
  return t < 2.65 ? '2d' : t < 5.1 ? '3d' : 'glass';
}
export function contentOpacity(time: number) {
  const t = clampTime(time * 1000);
  return t < 8.3 ? 1 : t < 8.65 ? 1 - smooth((t - 8.3) / .3) : smooth((t - 8.65) / .35);
}
const stops: PointerStop[] = [
  { at: 0, x: 748, y: 315 },
  { at: .55, x: 748, y: 315 },
  { at: 1.55, x: 672, y: 324 },
  { at: 2.5, x: 171, y: 191 },
  { at: 2.85, x: 171, y: 191 },
  { at: 3.2, x: 201.5, y: 441.78125 },
  { at: 3.45, x: 201.5, y: 441.78125 },
  { at: 4.45, x: 831, y: 389 },
  { at: 4.95, x: 249, y: 191 },
  { at: 5.35, x: 249, y: 191 },
  { at: 5.85, x: 793.44, y: 315 },
  { at: 6.1, x: 793.44, y: 315 },
  { at: 6.8, x: 728.24, y: 315 },
  { at: 7.05, x: 171, y: 526.953125 },
  { at: 7.3, x: 171, y: 526.953125 },
  { at: 7.5, x: 81.32, y: 393.171875 },
  { at: 8.1, x: 135.6, y: 393.171875 },
  { at: 8.3, x: 748, y: 315 },
  { at: 8.65, x: 748, y: 315 },
];
export function pointerAt(time: number) {
  const t = phaseTime(time);
  const index = Math.max(0, stops.findLastIndex(stop => stop.at <= t));
  const left = stops[index]!, right = stops[index + 1] ?? left;
  const linearDrag = left.at === .55 || left.at === 6.1 || left.at === 7.5;
  const progress = Math.min(1, Math.max(0, (t - left.at) / Math.max(.001, right.at - left.at)));
  const mix = linearDrag ? progress : smooth(progress);
  const click = CLICKS.findLast(at => at <= t);
  return { x: left.x + (right.x - left.x) * mix, y: left.y + (right.y - left.y) * mix,
    scale: cursorClickSpringScale(click === undefined ? -1 : t - click, true, 40) };
}
export function createMotion(pose: Pose) {
  return gsap.timeline({ paused: true }).to(pose, { time: 9, duration: 9, ease: 'none' }, 0);
}
