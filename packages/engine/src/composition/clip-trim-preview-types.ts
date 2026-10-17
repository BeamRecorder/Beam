import type { Clip, ClipComposition } from '../shared/composition-types';

export interface ClipTrimPreview {
  composition: ClipComposition;
  clips: readonly Clip[];
  durationMs: number;
}

export type ClipTrimPreviewFactory = (timeMs: number) => ClipTrimPreview;
