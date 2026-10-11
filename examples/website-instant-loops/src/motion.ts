import { cursorClickSpringScale } from '../../../packages/engine/src/cursor/cursor-click-spring';
import type { CursorPoint, DemoMode } from './demo-types';
type DetailMode = Exclude<DemoMode, 'hero'>;
export const DURATION = 8;
export function seekSeconds(ms: number) {
  return Number.isFinite(ms) ? Math.max(0, Math.min(8000, ms)) / 1000 : 0;
}
export function smooth(p: number) {
  const t = Math.max(0, Math.min(1, p));
  return t * t * (3 - 2 * t);
}
export function phaseTime(t: number) {
  return t >= 7.6 ? 0 : t;
}
export function contentOpacity(t: number) {
  if (t < 7.2) return 1;
  if (t < 7.6) return 1 - smooth((t - 7.2) / 0.4);
  return smooth((t - 7.6) / 0.4);
}
export function presetState(time: number) {
  const t = phaseTime(time);
  return {
    instant: t >= 0.85,
    open: (t >= 1.65 && t < 2.85) || (t >= 4.15 && t < 5.3),
    presetId: t >= 5.3 ? 'sunrise' : t >= 2.85 ? 'nocturne' : 'default',
  };
}
export function exportState(time: number) {
  const t = phaseTime(time);
  return {
    stopped: t >= 1.15,
    completed: t >= 5.65,
    progress: smooth((t - 1.15) / 4.5),
    renderTime: Math.max(0, t - 1.15),
    mascotTime: Math.max(0, t - (t >= 5.65 ? 5.65 : 1.15)),
  };
}
export function clipboardState(time: number) {
  const t = phaseTime(time);
  return {
    pasted: t >= 3.05,
    sent: t >= 3.8,
    attachmentReveal: smooth((t - 3.05) / 0.25),
    sendReveal: smooth((t - 3.8) / 0.28),
    firstReply: smooth((t - 4.55) / 0.28),
    secondReply: smooth((t - 5.65) / 0.28),
    typing: t >= 4.1 && t < 4.55,
    pasteHint: t >= 2.55 && t < 3.05,
    statusOpacity: 1 - smooth((t - 1.75) / 0.5),
    sourceTime: 6.3,
  };
}
export const CLICKS: Record<DetailMode, CursorPoint[]> = {
  presets: [
    { at: 0.85, x: 555, y: 119 },
    { at: 1.65, x: 470, y: 202 },
    { at: 2.85, x: 445, y: 286 },
    { at: 4.15, x: 470, y: 202 },
    { at: 5.3, x: 445, y: 324 },
  ],
  export: [{ at: 1.15, x: 442, y: 306 }],
  clipboard: [
    { at: 2.6, x: 190, y: 350 },
    { at: 3.8, x: 581, y: 350 },
  ],
};
const PATHS: Record<DetailMode, CursorPoint[]> = {
  presets: [
    { at: 0, x: 290, y: 290 },
    { at: 0.7, x: 555, y: 119 },
    { at: 1.05, x: 555, y: 119 },
    { at: 1.5, x: 470, y: 202 },
    { at: 1.9, x: 470, y: 202 },
    { at: 2.1, x: 445, y: 286 },
    { at: 3.05, x: 445, y: 286 },
    { at: 3.6, x: 300, y: 290 },
    { at: 4, x: 470, y: 202 },
    { at: 4.35, x: 470, y: 202 },
    { at: 4.7, x: 445, y: 324 },
    { at: 5.5, x: 445, y: 324 },
    { at: 6.3, x: 310, y: 291 },
  ],
  export: [
    { at: 0, x: 330, y: 235 },
    { at: 1, x: 442, y: 306 },
    { at: 1.4, x: 442, y: 306 },
    { at: 2.25, x: 582, y: 257 },
    { at: 5.8, x: 582, y: 257 },
    { at: 6.6, x: 550, y: 300 },
  ],
  clipboard: [
    { at: 0, x: 562, y: 337 },
    { at: 1, x: 562, y: 337 },
    { at: 2.3, x: 190, y: 350 },
    { at: 3.1, x: 190, y: 350 },
    { at: 3.8, x: 581, y: 350 },
    { at: 4.15, x: 581, y: 350 },
    { at: 4.7, x: 569, y: 315 },
    { at: 7, x: 569, y: 315 },
  ],
};
export function pointerAt(mode: DetailMode, time: number) {
  const t = phaseTime(time),
    points = PATHS[mode];
  const index = Math.max(
    0,
    points.findLastIndex((point) => point.at <= t),
  );
  const left = points[index]!,
    right = points[index + 1] ?? left;
  const p = smooth((t - left.at) / Math.max(0.001, right.at - left.at));
  const click = CLICKS[mode].findLast((click) => click.at <= t);
  return {
    x: left.x + (right.x - left.x) * p,
    y: left.y + (right.y - left.y) * p,
    scale: cursorClickSpringScale(click ? t - click.at : -1, true, 50),
  };
}
