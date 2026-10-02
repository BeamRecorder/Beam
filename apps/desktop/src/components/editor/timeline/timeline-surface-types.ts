import type { TimelineFrameQueue } from '@beam/runtime/timeline/frame-queue-types';
import type { InjectionKey, Ref } from 'vue';
import type { TimelineCanvasLaneProps } from './timeline-canvas-types';
import type { TimelineCanvasMarquee } from '@beam/runtime/timeline/timeline-canvas-types';

export interface TimelineSurfaceLane {
  element: HTMLElement;
  props: TimelineCanvasLaneProps;
  marquee(): TimelineCanvasMarquee | undefined;
}
export interface TimelineSurface {
  frames: TimelineFrameQueue;
  canvas: Ref<HTMLCanvasElement | null>;
  context(): CanvasRenderingContext2D | null;
  invalidate(): void;
  register(lane: TimelineSurfaceLane): () => void;
}
export const TIMELINE_SURFACE_KEY: InjectionKey<TimelineSurface> = Symbol('timeline-surface');
