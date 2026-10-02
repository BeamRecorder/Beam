import type { ClipComposition } from '@beam/engine';
export interface DocumentFile {
  composition: ClipComposition;
  replace(composition: ClipComposition): unknown;
}
