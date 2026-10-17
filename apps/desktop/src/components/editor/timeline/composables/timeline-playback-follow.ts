import { timelinePlaybackScrollDelta } from './timeline-viewport';
import { timelineVisualScale } from './timeline-coordinate-space';
import type { TimelinePlaybackGeometry } from './timeline-playback-follow-types';

/** Measure during layout updates; playback only reads the current scroll offset. */
export function createTimelinePlaybackFollow() {
  let geometry: TimelinePlaybackGeometry | null = null;
  return {
    measure(scroll: HTMLElement, viewport: DOMRect, ruler: DOMRect) {
      const visualScale = timelineVisualScale(scroll, viewport.width);
      const rulerWidth = ruler.width;
      geometry =
        [viewport.left, viewport.width, ruler.left, rulerWidth].every(Number.isFinite) &&
        viewport.width > 0 &&
        rulerWidth > 0
          ? {
              viewportWidth: viewport.width,
              rulerWidth,
              contentOrigin: ruler.left - viewport.left + scroll.scrollLeft * visualScale,
              visualScale,
            }
          : null;
    },
    delta(time: number, duration: number, scrollLeft: number) {
      if (!geometry || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(scrollLeft)) return 0;
      const clamped = Number.isFinite(time) ? Math.max(0, Math.min(duration, time)) : 0;
      const playhead =
        geometry.contentOrigin - scrollLeft * geometry.visualScale + (clamped / duration) * geometry.rulerWidth;
      return timelinePlaybackScrollDelta(playhead, 0, geometry.viewportWidth) / geometry.visualScale;
    },
  };
}
