import type { CursorPackDescriptor } from '@beam/engine/capture/cursor-pack';
export interface ScreenshotAssetServices {
  loadImage(source: string): Promise<HTMLImageElement>;
  fontSource(id: string): string;
  cursorPacks: readonly CursorPackDescriptor[];
  watermarkSource: string;
  onTiming?(stage: string, durationMs: number): void;
}
