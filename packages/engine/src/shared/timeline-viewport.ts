import type { TimelineView } from './timeline-viewport-types';

const validate = (view: TimelineView) => {
  if (
    ![view.offsetMs, view.pixelsPerMs, view.scrollY, view.width, view.height].every(Number.isFinite) ||
    view.pixelsPerMs <= 0 ||
    view.width < 0 ||
    view.height < 0
  )
    throw new RangeError('Invalid timeline viewport.');
};
/** Logical time is independent of canvas pixel dimensions and document duration. */
export function timelineTimeAt(view: TimelineView, x: number) {
  validate(view);
  if (!Number.isFinite(x)) throw new RangeError('Invalid timeline point.');
  return view.offsetMs + x / view.pixelsPerMs;
}
export function panTimelineView(view: TimelineView, dx: number, dy: number): TimelineView {
  validate(view);
  if (![dx, dy].every(Number.isFinite)) throw new RangeError('Invalid timeline pan.');
  return { ...view, offsetMs: view.offsetMs + dx / view.pixelsPerMs, scrollY: Math.max(0, view.scrollY + dy) };
}
export function timelineOffsetAtAnchor(timeMs: number, pixelsPerMs: number, anchorX: number) {
  if (![timeMs, pixelsPerMs, anchorX].every(Number.isFinite) || pixelsPerMs <= 0)
    throw new RangeError('Invalid timeline anchor.');
  return timeMs - anchorX / pixelsPerMs;
}
export function zoomTimelineView(view: TimelineView, factor: number, anchorX: number): TimelineView {
  validate(view);
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('Invalid timeline zoom.');
  const time = timelineTimeAt(view, anchorX);
  const pixelsPerMs = Math.max(1e-8, Math.min(1e5, view.pixelsPerMs * factor));
  return { ...view, pixelsPerMs, offsetMs: timelineOffsetAtAnchor(time, pixelsPerMs, anchorX) };
}
export function timelineWheelPixels(delta: number, mode: number, pageSize: number, lineHeight = 18) {
  if (![delta, mode, pageSize, lineHeight].every(Number.isFinite) || ![0, 1, 2].includes(mode))
    throw new RangeError('Invalid timeline wheel units.');
  return delta * (mode === 1 ? lineHeight : mode === 2 ? pageSize : 1);
}
