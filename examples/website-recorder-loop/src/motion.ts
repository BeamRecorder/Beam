import { gsap } from 'gsap';
import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import type { RecorderPose, RecorderStep } from './demo-types';

export const DURATION_MS = 12000;
export const STEPS: RecorderStep[] = [
  { at: 0.85, x: 279, y: 426, label: 'Full screen', target: 'screen' },
  { at: 2.05, x: 490, y: 426, label: 'Region', target: 'region' },
  { at: 3.3, x: 700, y: 426, label: 'Window', target: 'window' },
  { at: 4.5, x: 490, y: 352, label: 'Screenshot', mode: 'screenshot' },
  { at: 5.35, x: 658, y: 352, label: 'Instant', mode: 'instant' },
  { at: 6.2, x: 322, y: 352, label: 'Recorder', mode: 'studio' },
  { at: 7.05, x: 700, y: 426, label: 'Window', target: 'window', phase: 'recording' },
  { at: 8.25, x: 574, y: 660, label: 'Pause recording', phase: 'paused' },
  { at: 9.05, x: 574, y: 660, label: 'Resume recording', phase: 'recording' },
  { at: 10, x: 795, y: 660, label: 'Stop recording', phase: 'idle' },
];

export function initialPose(): RecorderPose {
  return { time: 0, x: 1015, y: 565, camera: 0, setupOpacity: 1, setupScale: 1, barOpacity: 0, barY: 18 };
}

export function clampTime(timeMs: number) {
  return Number.isFinite(timeMs) ? Math.max(0, Math.min(DURATION_MS, timeMs)) / 1000 : 0;
}

export function createMotion(pose: RecorderPose) {
  const timeline = gsap.timeline({ paused: true });
  timeline.to(pose, { time: 12, duration: 12, ease: 'none' }, 0);
  for (const step of STEPS) {
    timeline.to(pose, { x: step.x, y: step.y, duration: 0.5, ease: 'power2.inOut' }, step.at - 0.55);
  }
  timeline.to(pose, { camera: 1, duration: 1, ease: 'sine.inOut' }, 0.3);
  timeline.to(pose, { setupOpacity: 0, setupScale: 0.94, duration: 0.3, ease: 'power2.inOut' }, 7.08);
  timeline.to(pose, { barOpacity: 1, barY: 0, duration: 0.35, ease: 'power2.out' }, 7.25);
  timeline.to(pose, { barOpacity: 0, barY: 18, duration: 0.25, ease: 'power2.in' }, 10.04);
  timeline.to(pose, { setupOpacity: 1, setupScale: 1, duration: 0.4, ease: 'power2.out' }, 10.35);
  timeline.to(pose, { camera: 0, x: 1015, y: 565, duration: 0.8, ease: 'sine.inOut' }, 10.75);
  return timeline;
}

export function stateAt(time: number) {
  const steps = STEPS.filter((step) => step.at <= time);
  const restoring = time >= 10.3;
  const mode = restoring ? 'studio' : (steps.findLast((step) => step.mode)?.mode ?? 'studio');
  const target = restoring ? 'screen' : (steps.findLast((step) => step.target)?.target ?? 'screen');
  const phase = steps.findLast((step) => step.phase)?.phase ?? 'idle';
  const elapsed = Math.max(0, Math.min(time, 8.25) - 7.05) + Math.max(0, Math.min(time, 10) - 9.05);
  const tenths = Math.floor(elapsed * 10 + 1e-6);
  return { mode, target, phase, recordingTime: `00:0${Math.floor(tenths / 10)}.${tenths % 10}` };
}

export function clickScale(time: number) {
  const click = STEPS.findLast((step) => step.at <= time);
  return cursorClickSpringScale(click ? time - click.at : -1, true, 40);
}
