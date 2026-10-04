import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { ScreenshotRenderAssets } from '@beam/runtime/screenshot/screenshot-types';
import type { ScreenshotSelectionMode } from './screenshot-types';
export interface ScreenshotCanvasInteractionOptions {
  state: () => ScreenshotState;
  assets: () => ScreenshotRenderAssets | null;
  canvas: () => HTMLCanvasElement | null;
  blocked: () => boolean;
  selectedIds: () => readonly string[];
  select: (id: string | null, mode?: ScreenshotSelectionMode) => void;
  beginElement: (id: string) => boolean | undefined;
  crop: (id: string) => void;
  add: (event: MouseEvent) => void;
}
