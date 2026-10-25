import type { TimelineSelectionIds, TimelineSelectionMoveResult } from './timeline-edit-types';

export type TimelineGapRemovalPlan =
  | { kind: 'removable'; result: TimelineSelectionMoveResult }
  | { kind: 'overlap' | 'locked'; blockers: TimelineSelectionIds }
  | { kind: 'invalid' };
