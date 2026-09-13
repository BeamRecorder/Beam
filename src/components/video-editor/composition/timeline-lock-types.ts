import type { TimelineSelectionIds } from './timeline-edit-types';
export interface LockableTimelineItem {
  id: string;
  locked?: boolean;
  order?: number;
}
export interface TimelineLockRequest extends TimelineSelectionIds {
  locked: boolean;
}
export interface TimelineGap {
  clipIds: string[];
  startMs: number;
  endMs: number;
}
