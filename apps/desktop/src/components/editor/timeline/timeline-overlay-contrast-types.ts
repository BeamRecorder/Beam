import type { InjectionKey } from 'vue';
import type { TimelineOverlayColors } from '@beam/runtime/timeline/timeline-canvas-types';

export interface TimelineOverlayContrast {
  register(element: HTMLElement | SVGElement): () => void;
  prepare(canvas: HTMLCanvasElement, bounds: DOMRect, width: number, height: number): CanvasRenderingContext2D | null;
  capture(): void;
  at(x: number, y: number): TimelineOverlayColors | null;
  dispose(): void;
}
export const TIMELINE_OVERLAY_CONTRAST_KEY: InjectionKey<TimelineOverlayContrast> = Symbol('timeline-overlay-contrast');
