import type { RulerTick, TimelineBand } from './viewportTypes';
import { timecode } from './timelineModel';

export const TIMELINE_MARGIN = 64;

export function timelineTime(x: number, pixels: number): number {
  return (x - TIMELINE_MARGIN) / pixels * 1000;
}

/** Labels stay readable, with shorter half-unit and subdivision marks between them. */
export function rulerTicks(offset: number, width: number, pixels: number): RulerTick[] {
  if (![offset, width, pixels].every(Number.isFinite) || width <= 0 || pixels <= 0) return [];
  const target = 90_000 / pixels;
  const power = 10 ** Math.floor(Math.log10(target));
  const major = [1, 2, 5, 10].find(step => step * power >= target)! * power;
  const minor = major / 10;
  const start = Math.floor(timelineTime(offset, pixels) / minor);
  const count = Math.min(512, Math.ceil(width * 1000 / pixels / minor) + 2);
  return Array.from({ length: count }, (_, i) => {
    const index = start + i, timeMs = index * minor;
    const full = index % 10 === 0;
    const label = full ? `${timeMs < 0 ? '−' : ''}${timecode(Math.abs(timeMs)).slice(0, major < 1000 ? 9 : 5)}` : undefined;
    return { timeMs, x: TIMELINE_MARGIN + timeMs / 1000 * pixels, height: full ? 12 : index % 5 === 0 ? 8 : 4, label };
  });
}

/** Alternating time bands remain anchored to time when the viewport pans. */
export function timelineBands(ticks: readonly RulerTick[]): TimelineBand[] {
  const majors = ticks.filter(tick => tick.label !== undefined);
  if (majors.length < 2) return [];
  const width = majors[1].x - majors[0].x;
  const time = majors[1].timeMs - majors[0].timeMs;
  return majors.map(tick => ({ x: tick.x, width, alternate: Math.abs(Math.round(tick.timeMs / time)) % 2 === 1 }));
}

export function timelineZoom(pixels: number, direction: number): number {
  if (!Number.isFinite(pixels) || !Number.isFinite(direction)) return 80;
  return Math.max(8, Math.min(300, pixels * 1.4 ** Math.max(-1, Math.min(1, direction))));
}
