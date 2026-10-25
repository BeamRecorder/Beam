import type { ZoomElement } from './zoom-types';
export interface SplitZoomContinuity {
  elements: readonly ZoomElement[];
  elementIdAt(id: string | undefined, timeMs: number): string | undefined;
}
