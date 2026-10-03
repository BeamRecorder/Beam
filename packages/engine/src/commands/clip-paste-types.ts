import type { Clip, ClipComposition, MediaAsset } from '@beam/engine/shared/composition-types';

export interface ClipPasteLane {
  clips: Clip[];
  endMs: number;
}

export interface PasteClipOptions {
  timelineStartMs: number;
  timelineDurationMs: number;
  targetTrackId?: string | null;
  asset?: MediaAsset | null;
  idFactory?: () => string;
}
export interface PasteClipResult {
  composition: ClipComposition;
  clipId: string;
}
