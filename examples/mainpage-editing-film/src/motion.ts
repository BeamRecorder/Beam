import type { CursorWaypoint, InspectorMode } from './film-types';
import { cursorClickSpringScale } from '@beam/engine/cursor/cursor-click-spring';

export const INTRO_END = 3.5;
export const EDIT_END = 23.95;
export const ENDING_START = 20.672;
export const DURATION = EDIT_END + 2.054;
export const OUTRO_START = 22.65;
export const TRIM_START = 10.8;
export const TRIM_END = 11.8;
export const SHAPE_START = 14.6;
export const SHAPE_END = 15.6;
export const BLUR_START = 18.4;
export const BLUR_END = 19.4;
export const PREVIEW_START = 21.45;
export const SCRUB_TIME = 4.8;
export const BACKGROUND_BLUR_START = 8;
export const BACKGROUND_BLUR_END = 9.4;
export const PIXELATED_TIME = 20.25;
export const NORMAL_BLUR_TIME = 20.85;
export const CURSOR_SIZE = 64;
export const BACKGROUND_CHANGES = [
  { time: 5.8, id: 'ventura' },
  { time: 6.55, id: 'light' },
  { time: 7.3, id: 'sunset' },
] as const;
export function wallpaperAt(time: number) {
  for (let index = BACKGROUND_CHANGES.length - 1; index >= 0; index--)
    if (time >= BACKGROUND_CHANGES[index]!.time) return BACKGROUND_CHANGES[index]!.id;
  return 'golden';
}
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
export const blurPercentAt = (time: number) =>
  20 * travel(progress(time, BACKGROUND_BLUR_START, 8.5)) + 45 * travel(progress(time, 8.7, BACKGROUND_BLUR_END));
export const previewTimeAt = (time: number) =>
  time < SCRUB_TIME ? 3.5 : 0.2 + Math.max(0, Math.min(OUTRO_START - PREVIEW_START, time - PREVIEW_START));
export const modeAt = (time: number): InspectorMode =>
  time < TRIM_START ? 'canvas' : time < SHAPE_START ? 'clip' : time < BLUR_START ? 'shape' : 'blur';
export const menuAt = (time: number) =>
  time >= 13.05 && time < 13.95 ? 'shape' : time >= 16.8 && time < 17.75 ? 'blur' : null;
export const cursorOpacityAt = (time: number) =>
  ease(progress(time, INTRO_END, 4)) * (1 - ease(progress(time, OUTRO_START - 0.4, OUTRO_START)));
export function pressScaleAt(time: number) {
  for (let index = waypoints.length - 1; index >= 0; index--) {
    const point = waypoints[index]!;
    if (point.pressed && point.time <= time) return cursorClickSpringScale(time - point.time, true, 65);
  }
  return 1;
}
export const waypoints: readonly CursorWaypoint[] = [
  { time: 3.5, target: '.film-preview-target', x: 0.75, y: 0.68 },
  { time: SCRUB_TIME, target: '.ruler-ticks-area', x: 0.009, y: 0.5, pressed: true },
  ...BACKGROUND_CHANGES.flatMap((change) => [
    { time: change.time, target: `[data-film-wallpaper="${change.id}"]`, pressed: true },
    { time: change.time + 0.2, target: `[data-film-wallpaper="${change.id}"]` },
  ]),
  { time: BACKGROUND_BLUR_START, target: '.film-inspector .big-slider-input', x: 0, pressed: true },
  { time: 8.5, target: '.film-inspector .big-slider-input', x: 0.2 },
  { time: 8.7, target: '.film-inspector .big-slider-input', x: 0.2 },
  { time: BACKGROUND_BLUR_END, target: '.film-inspector .big-slider-input', x: 0.65, pressed: true },
  { time: TRIM_START, target: '[data-timeline-clip-id="screen"] .trim-handle.end', pressed: true },
  { time: TRIM_END, target: '[data-timeline-clip-id="screen"] .trim-handle.end', pressed: true },
  { time: 13.05, target: '.film-add button', pressed: true },
  { time: 13.5, target: '.menu-item[data-film-choice="shape"]' },
  { time: 13.8, target: '.menu-item[data-film-choice="shape"]', pressed: true },
  { time: SHAPE_START, target: '[data-film-anchor="shape-start"]', pressed: true },
  { time: SHAPE_END, target: '[data-film-anchor="shape-end"]', pressed: true },
  { time: 16.8, target: '.film-add button', pressed: true },
  { time: 17.3, target: '.menu-item[data-film-choice="blur"]' },
  { time: 17.6, target: '.menu-item[data-film-choice="blur"]', pressed: true },
  { time: BLUR_START, target: '[data-film-anchor="blur-start"]', pressed: true },
  { time: BLUR_END, target: '[data-film-anchor="blur-end"]', pressed: true },
  { time: PIXELATED_TIME, target: '[data-film-mode="pixelated"]', pressed: true },
  { time: NORMAL_BLUR_TIME, target: '[data-film-mode="blur"]', pressed: true },
  { time: 21.95, target: '.film-preview-target', x: 0.78, y: 0.8 },
  { time: OUTRO_START, target: '.film-preview-target', x: 0.78, y: 0.8 },
];
