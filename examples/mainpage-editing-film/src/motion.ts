import type { CursorWaypoint, InspectorMode } from './film-types';

export const INTRO_END = 3.5;
export const EDIT_END = 21.5;
export const ENDING_START = 20.672;
export const DURATION = EDIT_END + 2.054;
export const OUTRO_START = 20.2;
export const TRIM_START = 8.35;
export const TRIM_END = 9.35;
export const SHAPE_START = 12.15;
export const SHAPE_END = 13.15;
export const BLUR_START = 15.95;
export const BLUR_END = 16.95;
export const PREVIEW_START = 19;
export const progress = (time: number, start: number, end: number) =>
  Math.max(0, Math.min(1, (time - start) / (end - start)));
export const ease = (value: number) => value ** 3 * (10 - 15 * value + 6 * value ** 2);
/** Cosine velocity ramps and a steady middle avoid whipping across long UI journeys. */
export function travel(value: number): number {
  const p = Math.max(0, Math.min(1, value));
  if (p > 0.75) return 1 - travel(1 - p);
  if (p >= 0.25) return (p - 0.125) / 0.75;
  return (p - Math.sin(4 * Math.PI * p) / (4 * Math.PI)) / 1.5;
}
export const endingBlendAt = (time: number) => ease(progress(time, OUTRO_START + 0.15, EDIT_END));
export const transitionAt = (time: number) =>
  ease(progress(time, INTRO_END, 4.6)) * (1 - ease(progress(time, OUTRO_START, EDIT_END)));
export const trimAt = (time: number) => travel(progress(time, TRIM_START, TRIM_END));
export const shapeAt = (time: number) => travel(progress(time, SHAPE_START, SHAPE_END));
export const blurAt = (time: number) => travel(progress(time, BLUR_START, BLUR_END));
export const blurPercentAt = (time: number) => 5 + 29 * travel(progress(time, 5.55, 6.4));
export const previewTimeAt = (time: number) =>
  time < 7.05 ? 3.5 : 0.2 + Math.max(0, Math.min(OUTRO_START - PREVIEW_START, time - PREVIEW_START));
export const modeAt = (time: number): InspectorMode =>
  time < 8.35 ? 'canvas' : time < SHAPE_START ? 'clip' : time < BLUR_START ? 'shape' : 'blur';
export const menuAt = (time: number) =>
  time >= 10.6 && time < 11.5 ? 'shape' : time >= 14.35 && time < 15.3 ? 'blur' : null;
export const cursorOpacityAt = (time: number) =>
  ease(progress(time, INTRO_END, 4)) * (1 - ease(progress(time, 19.8, OUTRO_START)));
export const pressScaleAt = (time: number) =>
  1 -
  0.06 *
    Math.max(
      0,
      ...waypoints.filter((point) => point.pressed).map((point) => Math.exp(-(((time - point.time) / 0.09) ** 2))),
    );
export const waypoints: readonly CursorWaypoint[] = [
  { time: 3.5, target: '.film-preview-target', x: 0.75, y: 0.68 },
  { time: 4.65, target: '[data-film-wallpaper="ventura"]' },
  { time: 4.8, target: '[data-film-wallpaper="ventura"]', pressed: true },
  { time: 5.55, target: '.film-inspector .slider-row', x: 0.1, y: 0.66, pressed: true },
  { time: 6.4, target: '.film-inspector .slider-row', x: 0.37, y: 0.66, pressed: true },
  { time: 7.05, target: '.ruler-ticks-area', x: 0.009, y: 0.5, pressed: true },
  { time: TRIM_START, target: '[data-timeline-clip-id="screen"] .trim-handle.end', pressed: true },
  { time: TRIM_END, target: '[data-timeline-clip-id="screen"] .trim-handle.end', pressed: true },
  { time: 10.6, target: '.film-add button', pressed: true },
  { time: 11.05, target: '.menu-item[data-film-choice="shape"]' },
  { time: 11.35, target: '.menu-item[data-film-choice="shape"]', pressed: true },
  { time: SHAPE_START, target: '[data-film-anchor="shape-start"]', pressed: true },
  { time: SHAPE_END, target: '[data-film-anchor="shape-end"]', pressed: true },
  { time: 14.35, target: '.film-add button', pressed: true },
  { time: 14.85, target: '.menu-item[data-film-choice="blur"]' },
  { time: 15.15, target: '.menu-item[data-film-choice="blur"]', pressed: true },
  { time: BLUR_START, target: '[data-film-anchor="blur-start"]', pressed: true },
  { time: BLUR_END, target: '[data-film-anchor="blur-end"]', pressed: true },
  { time: 17.8, target: '[data-film-mode="pixelated"]', pressed: true },
  { time: 18.4, target: '[data-film-mode="blur"]', pressed: true },
  { time: 19.5, target: '.film-preview-target', x: 0.78, y: 0.8 },
  { time: OUTRO_START, target: '.film-preview-target', x: 0.78, y: 0.8 },
];
