import type { TimelineRegion } from '../shared/generated/editorContracts';
import type { ClipPlacement } from '../shared/editorTypes';
import type { RegionGesture, RegionWindow } from './regionTypes';

/** Region clocks are converted only for drawing; committed ranges go through Rust. */
export function regionWindow(region: TimelineRegion): RegionWindow {
  return { startMs: region.start.ticks * 1000 / region.start.timescale, endMs: region.end.ticks * 1000 / region.end.timescale };
}
export function dragRegion(window: RegionWindow, clip: ClipPlacement, deltaMs: number, gesture: RegionGesture): RegionWindow {
  const low = clip.startMs, high = low + clip.durationMs;
  const start = Math.max(low, window.startMs), end = Math.min(high, window.endMs);
  const minimum = Math.min(1, end - start);
  if (gesture === 'start') return { startMs: Math.max(low, Math.min(end - minimum, start + deltaMs)), endMs: end };
  if (gesture === 'end') return { startMs: start, endMs: Math.min(high, Math.max(start + minimum, end + deltaMs)) };
  const delta = Math.max(low - start, Math.min(high - end, deltaMs));
  return { startMs: start + delta, endMs: end + delta };
}
