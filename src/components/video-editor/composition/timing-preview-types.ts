import type { Clip, ClipComposition } from '~/media/shared/composition-types';

export interface TimingPreview {
  patches: ReadonlyMap<string, Clip>;
  at(timeMs: number, screensOnly?: boolean): Clip[];
  order(clip: Clip): number;
  visualEnabledStates(): ReadonlyMap<string, boolean>;
  clip(id: string): Clip | undefined;
}

export type TimingPreviewFactory = (patches: readonly Clip[]) => ClipComposition;
