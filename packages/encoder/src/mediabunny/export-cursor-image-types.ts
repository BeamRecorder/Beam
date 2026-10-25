import type { CursorAssetDescriptor, CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
export interface RequiredCursorImage {
  id: string;
  asset: CursorAssetDescriptor;
  pack: CursorPackDescriptor;
  size: number;
  color: string;
}
