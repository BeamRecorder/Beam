import type { TimelineRegion } from '../shared/generated/editorContracts';
import type { ClipPlacement } from '../shared/editorTypes';

export interface RegionWindow { startMs: number; endMs: number }
export interface RegionRow { region: TimelineRegion; clip: ClipPlacement; top: number }
export type RegionGesture = 'move' | 'start' | 'end';
