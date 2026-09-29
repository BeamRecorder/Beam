import type { Asset, Clip } from '../shared/editorTypes';
export type VisualRequest = { kind: 'video'; positionMs: number } | { kind: 'audio'; startMs: number; endMs: number; stepMs: number };
export interface VisualLease { key: string; canvasId: number; status: 'loading' | 'ready' | 'failed'; error: string | null }
export interface VisualState { canvasId?: number; status: VisualLease['status']; error: string | null }
export interface SourceVisualEntry {
  listeners: Set<(state: VisualState) => void>;
  state: VisualState;
  lease?: VisualLease;
  acquire: () => Promise<VisualLease>;
}
export interface VisualTile { id: string; x: number; width: number; startMs: number; endMs: number; request: VisualRequest }
export interface VisualViewport { startMs: number; endMs: number; pixels: number }
export interface VisualPlan { asset: Asset; clip: Pick<Clip, 'startMs' | 'sourceInMs' | 'durationMs'>; viewport: VisualViewport }
