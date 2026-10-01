import type { ClipComposition } from '~/media/shared/composition-types';
export interface CanvasDoubleClickOptions {
  beginElement: (event: MouseEvent) => boolean;
  beginCaption: (event: MouseEvent) => boolean;
  blocked: () => boolean;
  clipIdAt: (event: MouseEvent) => string | null;
  composition: () => ClipComposition;
  crop: (id: string) => void;
  add: (event: MouseEvent) => void;
}
