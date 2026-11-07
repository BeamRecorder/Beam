import type { ShallowRef } from 'vue';
import type { Clip, ShapeClip } from '@beam/engine/shared/composition-types';

export interface ElementAssetSaveDraft {
  clip: ShapeClip;
  canvas: { width: number; height: number };
}

export interface ElementAssetSaving {
  draft: ShallowRef<ElementAssetSaveDraft | null>;
  label: () => string;
  source: (id: string) => ShapeClip | null;
  supports: (clip: Clip | null | undefined) => clip is ShapeClip;
  canSave: (clip: Clip | null | undefined) => boolean;
  request: (clip: Clip | null | undefined) => void;
  close: () => void;
}
