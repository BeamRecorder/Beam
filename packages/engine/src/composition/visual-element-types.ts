export type TimelineAddableVisualKind = 'image' | 'color' | 'shape' | 'text' | 'blur' | 'highlight';

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
