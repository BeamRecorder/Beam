import type { ZoomFocus } from './zoom-types';

export function clampFocusToScale(focus: ZoomFocus, scale: number): ZoomFocus {
  const margin = 1 / (2 * Math.max(1, scale));
  return { cx: Math.min(1 - margin, Math.max(margin, focus.cx)), cy: Math.min(1 - margin, Math.max(margin, focus.cy)) };
}
