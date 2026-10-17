import type { CursorWaypoint, InspectorMode } from './film-types';

export const INTRO_END = 3.5;
export const EDIT_END = 18.5;
export const ENDING_START = 20.672;
export const DURATION = EDIT_END + 2.054;
export const progress = (time: number, start: number, end: number) =>
  Math.max(0, Math.min(1, (time - start) / (end - start)));
export const ease = (value: number) => value ** 3 * (10 - 15 * value + 6 * value ** 2);
export const transitionAt = (time: number) => ease(progress(time, 3.5, 4.3)) * (1 - ease(progress(time, 17.85, 18.5)));
export const trimAt = (time: number) => ease(progress(time, 8.05, 9.05));
export const shapeAt = (time: number) => ease(progress(time, 10.8, 11.65));
export const blurAt = (time: number) => ease(progress(time, 13.8, 14.65));
export const blurPercentAt = (time: number) => 5 + 29 * ease(progress(time, 5.85, 6.55));
export const previewTimeAt = (time: number) => (time < 7.1 ? 3.5 : 0.2 + Math.max(0, Math.min(1.3, time - 16.6)));
export const modeAt = (time: number): InspectorMode =>
  time < 7.5 ? 'canvas' : time < 10.8 ? 'clip' : time < 13.8 ? 'shape' : 'blur';
export const menuAt = (time: number) =>
  time >= 9.55 && time < 10.65 ? 'shape' : time >= 12.65 && time < 13.65 ? 'blur' : null;
export const waypoints: readonly CursorWaypoint[] = [
  { time: 3.5, target: '.film-preview-target', x: 0.75, y: 0.68 },
  { time: 4.35, target: '[data-film-wallpaper="ventura"]', role: 'handpointing' },
  { time: 4.7, target: '[data-film-wallpaper="ventura"]', role: 'handpointing', pressed: true },
  { time: 5.25, target: '.film-inspector .slider-row', x: 0.2, y: 0.66 },
  { time: 5.85, target: '.film-inspector .slider-row', x: 0.1, y: 0.66, pressed: true },
  { time: 6.55, target: '.film-inspector .slider-row', x: 0.37, y: 0.66, pressed: true },
  { time: 7.1, target: '.ruler-ticks-area', x: 0.009, y: 0.5, pressed: true },
  { time: 7.55, target: '[data-timeline-clip-id="screen"]', x: 0.85, y: 0.5 },
  { time: 8.05, target: '[data-timeline-clip-id="screen"] .trim-handle.end', role: 'resizewesteast', pressed: true },
  { time: 9.05, target: '[data-timeline-clip-id="screen"] .trim-handle.end', role: 'resizewesteast', pressed: true },
  { time: 9.55, target: '.film-add button', role: 'handpointing', pressed: true },
  { time: 10.1, target: '.menu-item[data-film-choice="shape"]', role: 'handpointing' },
  { time: 10.5, target: '.menu-item[data-film-choice="shape"]', role: 'handpointing', pressed: true },
  { time: 10.8, target: '[data-film-anchor="shape-start"]', role: 'cross', pressed: true },
  { time: 11.65, target: '[data-film-anchor="shape-end"]', role: 'cross', pressed: true },
  { time: 12.1, target: '.film-preview-target', x: 0.65, y: 0.6 },
  { time: 12.65, target: '.film-add button', role: 'handpointing', pressed: true },
  { time: 13.35, target: '.menu-item[data-film-choice="blur"]', role: 'handpointing', pressed: true },
  { time: 13.8, target: '[data-film-anchor="blur-start"]', role: 'cross', pressed: true },
  { time: 14.65, target: '[data-film-anchor="blur-end"]', role: 'cross', pressed: true },
  { time: 15.2, target: '[data-film-mode="pixelated"]', role: 'handpointing', pressed: true },
  { time: 15.8, target: '[data-film-mode="blur"]', pressed: true },
  { time: 16.4, target: '.film-preview-target', x: 0.78, y: 0.8 },
  { time: 17.85, target: '.film-preview-target', x: 0.85, y: 0.9 },
];
