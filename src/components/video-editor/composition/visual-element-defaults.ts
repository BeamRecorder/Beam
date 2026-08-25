import type { TimelineAddableVisualKind } from './visual-element-types';

export const DEFAULT_VISUAL_ELEMENT_DURATION_MS: Readonly<Record<TimelineAddableVisualKind, number>> = {
  image: 5_000,
  color: 3_000,
  shape: 3_000,
  blur: 3_000,
};
