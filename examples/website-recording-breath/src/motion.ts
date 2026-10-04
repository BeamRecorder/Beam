import { gsap } from 'gsap';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import type { BreathPose } from './breath-types';

export const DURATION_MS = 10000;
export const PAUSE_AT = 1.2;
export const RESUME_AT = 4.65;
export const PAUSE_POINT = { x: 574, y: 719 };

export function initialPose(): BreathPose {
  return { time: 0, x: 1015, y: 535, camera: 0 };
}
export function clampTime(timeMs: number) {
  return Number.isFinite(timeMs) ? Math.max(0, Math.min(DURATION_MS, timeMs)) / 1000 : 0;
}
export function createMotion(pose: BreathPose) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(pose, { time: 10, duration: 10, ease: 'none' }, 0);
  timeline.to(pose, { ...PAUSE_POINT, duration: 0.65, ease: 'power2.inOut' }, 0.45);
  timeline.to(pose, { x: 930, y: 570, duration: 0.55, ease: 'power2.inOut' }, 1.65);
  timeline.to(pose, { ...PAUSE_POINT, duration: 0.65, ease: 'power2.inOut' }, 3.9);
  timeline.to(pose, { x: 1015, y: 535, duration: 0.65, ease: 'power2.inOut' }, 5.1);
  timeline.to(pose, { camera: 1, duration: 1.1, ease: 'sine.inOut' }, 0.45);
  timeline.to(pose, { camera: 0, duration: 1.2, ease: 'sine.inOut' }, 7.4);
  return timeline;
}
export function stateAt(time: number) {
  const bounded = clampTime(time * 1000);
  const paused = bounded >= PAUSE_AT && bounded < RESUME_AT;
  const elapsed = Math.min(bounded, PAUSE_AT) + Math.max(0, bounded - RESUME_AT);
  const tenths = Math.floor((12 + elapsed) * 10 + 1e-6);
  // Return to the opening frame during the final, short footage crossfade.
  const display = bounded >= 9.7 ? 120 : tenths;
  return {
    phase: paused ? ('paused' as const) : ('recording' as const),
    recordingTime: `00:${String(Math.floor(display / 10)).padStart(2, '0')}.${display % 10}`,
    resetOpacity: Math.max(0, 1 - bounded / 0.15, Math.min(1, (bounded - 9.55) / 0.45)),
  };
}
export function clickScale(time: number) {
  const click = time >= RESUME_AT ? RESUME_AT : time >= PAUSE_AT ? PAUSE_AT : -1;
  return cursorClickSpringScale(click < 0 ? -1 : time - click, true, 40);
}
