export type TimelineAddableVisualKind = 'image' | 'color' | 'shape' | 'blur';

export interface AddVisualElementRequest {
  kind: TimelineAddableVisualKind;
  trackId: string;
  startMs: number;
  durationMs: number;
}

export interface ImportedVisualPlacement {
  trackId?: string;
  durationMs?: number;
}
