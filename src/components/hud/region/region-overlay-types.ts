import type { ScreenRegion } from '~/api/types/screen-region';

export type RegionHandle = 'nw' | 'ne' | 'sw' | 'se';
export type RegionInteraction =
  | { kind: 'draw'; startX: number; startY: number; previous: ScreenRegion | null }
  | { kind: 'move'; startX: number; startY: number; region: ScreenRegion }
  | { kind: 'resize'; handle: RegionHandle; startX: number; startY: number; region: ScreenRegion }
  | null;
export interface RegionPointer {
  x: number;
  y: number;
  handle?: RegionHandle;
}
export interface RegionViewport {
  width: number;
  height: number;
}
export interface RegionControlPosition {
  left: string;
  top?: string;
  bottom?: string;
}
